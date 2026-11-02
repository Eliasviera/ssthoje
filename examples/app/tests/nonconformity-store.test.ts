import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNonconformity, listNonconformities, transitionNonconformity } from "../src/lib/nonconformity-store.ts";
const original = process.cwd();
let temporary = "";
before(() => { temporary = mkdtempSync(join(tmpdir(), "sst-nc-test-")); process.chdir(temporary); });
after(() => { process.chdir(original); if (temporary) rmSync(temporary, {recursive:true,force:true}); });
const fixture = () => ({tenantId:"tenant-a",companyId:"company-a",unitId:"unit-a",title:"Ocorrência sintética",description:"Fato simulado",evidence:"Observação fictícia",location:"Local de teste",responsible:"Pessoa fictícia",actionPlan:"Correção de demonstração",dueDate:"2026-10-30",actorUserId:"account-a"});
test("isola consulta e alteração por tenant e mantém ator no histórico",()=>{
  const record = createNonconformity(fixture());
  assert.equal(listNonconformities("tenant-b").length,0);
  assert.throws(()=>transitionNonconformity("tenant-b",record.id,1,"in_progress","Tentativa","account-b"));
  assert.equal(listNonconformities("tenant-a").find(item=>item.id===record.id)?.revision,1);
  assert.equal(record.history[0].actorUserId,"account-a");
});
test("rejeita datas impossíveis e campos acima do limite sem gravar",()=>{
  const count = listNonconformities("tenant-a").length;
  assert.throws(()=>createNonconformity({...fixture(),dueDate:"2026-02-30"}));
  assert.throws(()=>createNonconformity({...fixture(),description:"x".repeat(2001)}));
  assert.equal(listNonconformities("tenant-a").length,count);
});
test("bloqueia encerramento direto, revisão antiga e observação vazia",()=>{
  const record = createNonconformity(fixture());
  assert.throws(()=>transitionNonconformity("tenant-a",record.id,1,"closed","Encerrar","account-a"));
  assert.throws(()=>transitionNonconformity("tenant-a",record.id,1,"in_progress"," ","account-a"));
  transitionNonconformity("tenant-a",record.id,1,"in_progress","Iniciada correção","account-a");
  assert.throws(()=>transitionNonconformity("tenant-a",record.id,1,"in_review","Revisar","account-a"));
  assert.equal(listNonconformities("tenant-a").find(item=>item.id===record.id)?.history.length,2);
});
test("correção, devolução, encerramento e reabertura preservam evidência e histórico",()=>{
  let record = createNonconformity(fixture());
  const steps = ["in_progress","in_review","in_progress","in_review","closed","in_progress"] as const;
  for (const status of steps) record=transitionNonconformity("tenant-a",record.id,record.revision,status,`Registro de ${status}`,"reviewer-a");
  const saved=listNonconformities("tenant-a").find(item=>item.id===record.id)!;
  assert.deepEqual(saved.history.map(event=>event.status),["open",...steps]);
  assert.equal(saved.evidence,fixture().evidence);
  assert.equal(saved.description,fixture().description);
  assert.equal(saved.revision,7);
  record.history[0].note="Mutação externa";
  assert.notEqual(listNonconformities("tenant-a").find(item=>item.id===record.id)?.history[0].note,"Mutação externa");
});
