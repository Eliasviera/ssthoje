import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkingHistory, saveWorkingEntry } from "../src/lib/pgr-working-store.ts";
test("inclusão e edição preservam histórico, origem e controle de versão", () => {
  const cwd = process.cwd(), temp = mkdtempSync(join(tmpdir(), "working-pgr-"));
  process.chdir(temp);
  try {
    const hash = "a".repeat(64);
    const fields = { name: "Perigo de teste", sector: "Setor de teste", role: "Função de teste", activity: "Atividade de teste", description: "Fonte de teste", harm: "Dano de teste", controls: "Controle de teste", evidence: "Inspeção fictícia" };
    const input = { id: "", kind: "risk" as const, fields, reason: "Inclusão de teste", actorUserId: "fixture-reviewer" };
    const created = saveWorkingEntry("tenant-a", "company-a", hash, input, 0);
    assert.match(created.id, /^risk:new-/);
    saveWorkingEntry("tenant-a", "company-a", hash, { ...input, id: created.id, fields: { ...fields, name: "Perigo ajustado" } }, 1);
    assert.throws(() => saveWorkingEntry("tenant-a", "company-a", hash, { ...input, id: created.id }, 1), /mudou/);
    const history = readWorkingHistory("tenant-a", "company-a", hash);
    assert.equal(history.length, 2); assert.equal(history[0].fields.name, fields.name); assert.equal(history[1].fields.name, "Perigo ajustado");
    assert.equal(readWorkingHistory("tenant-b", "company-a", hash).length, 0);
    assert.equal(readWorkingHistory("tenant-a", "company-b", hash).length, 0);
    assert.equal(readWorkingHistory("tenant-a", "company-a", "b".repeat(64)).length, 0);
    assert.throws(() => saveWorkingEntry("tenant-a", "company-a", hash, { ...input, fields: { ...fields, evidence: "" } }, 0), /Preencha/);
    assert.throws(() => saveWorkingEntry("tenant-a", "company-a", hash, { ...input, id: "role:0" }, 0), /inválido/);
    assert.throws(() => readWorkingHistory("../other", "company-a", hash), /inválida/);
  } finally { process.chdir(cwd); rmSync(temp, { recursive: true, force: true }); }
});

test("ações mantêm revisões, recusam conflito e ficam isoladas por tenant e origem", () => {
  const cwd=process.cwd(), temp=mkdtempSync(join(tmpdir(),"working-action-"));
  process.chdir(temp);
  try {
    const hash="c".repeat(64);
    const fields={name:"Ação fictícia",sector:"",role:"",activity:"Posto fictício",description:"Adequação",harm:"",controls:"",evidence:"Inspeção fictícia",responsible:"Equipe fictícia",priority:"Alta",objective:"Meta fictícia",startDate:"Não definido",endDate:""};
    const input={id:"action:0",kind:"action" as const,fields,reason:"Ajuste de teste",actorUserId:"fixture"};
    saveWorkingEntry("tenant-a","company-a",hash,input,0);
    saveWorkingEntry("tenant-a","company-a",hash,{...input,fields:{...fields,responsible:"Outra equipe fictícia"}},1);
    assert.throws(()=>saveWorkingEntry("tenant-a","company-a",hash,input,1),/mudou/);
    const history=readWorkingHistory("tenant-a","company-a",hash);
    assert.equal(history.length,2); assert.equal(history[0].fields.responsible,"Equipe fictícia");
    assert.equal(readWorkingHistory("tenant-b","company-a",hash).length,0);
    assert.equal(readWorkingHistory("tenant-a","company-a","d".repeat(64)).length,0);
    assert.throws(()=>saveWorkingEntry("tenant-a","company-a",hash,{...input,fields:{...fields,description:"x".repeat(3001)}},2),/limites/);
  } finally {process.chdir(cwd);rmSync(temp,{recursive:true,force:true});}
});
