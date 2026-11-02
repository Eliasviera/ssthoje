import assert from "node:assert/strict";
import test,{beforeEach,afterEach} from "node:test";
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {getReferenceGovernance,reviewReference,assertReferenceReviewed,referenceIssues} from "../src/lib/reference-governance.ts";
import type {ComplianceRule} from "../src/lib/compliance-store.ts";
const original=process.cwd(),user="sst-demo-user",tenant="tenant-horizonte";
const rule=():ComplianceRule=>({id:"rule-ficticia",tenantId:tenant,title:"Conferência fictícia",documentKind:"PGR",criteria:"Critério de demonstração sem regra normativa",sourceTitle:"Fonte fictícia",sourceVersion:"Exemplo 1",jurisdiction:"Ambiente fictício",validFrom:"2000-01-01",validUntil:"2099-12-31",reviewer:"Revisor fictício",version:1,status:"active",previousRuleId:"",createdAt:new Date().toISOString(),createdBy:user});
function save(rules:ComplianceRule[]){mkdirSync("data",{recursive:true});writeFileSync("data/compliance.json",JSON.stringify({rules,evaluations:[{id:"historical-evaluation"}]}));}
beforeEach(()=>{mkdirSync(join(original,"data"),{recursive:true});process.chdir(mkdtempSync(join(original,"data","reference-tests-")));save([rule()]);});
afterEach(()=>process.chdir(original));
test("referências: acesso da consultoria, isolamento e Master sem revisão técnica",()=>{
  for(const actor of ["","sst-demo-master","sst-demo-medico"]){assert.throws(()=>getReferenceGovernance(actor));assert.throws(()=>reviewReference(actor,"rule-ficticia",1,"reviewed","Teste"));}
  assert.equal(getReferenceGovernance("sst-demo-user-b").rules.length,0);
  assert.throws(()=>getReferenceGovernance("sst-demo-user-b",tenant));
  assert.throws(()=>reviewReference("sst-demo-user-b","rule-ficticia",1,"reviewed","Teste"));
});
test("referências: revisão vigente exigida, sinalização posterior bloqueia sem alterar avaliações",()=>{
  assert.throws(()=>assertReferenceReviewed(user,"rule-ficticia",tenant));const before=readFileSync("data/compliance.json","utf8");
  reviewReference(user,"rule-ficticia",1,"reviewed","Conferência fictícia");assertReferenceReviewed(user,"rule-ficticia",tenant);
  reviewReference("sst-demo-sst","rule-ficticia",1,"needs_update","Rever referência");assert.throws(()=>assertReferenceReviewed(user,"rule-ficticia",tenant));
  assert.equal(getReferenceGovernance(user).history.length,2);assert.equal(readFileSync("data/compliance.json","utf8"),before);
});
test("referências: metadados, vigência e versão antiga impedem conferência",()=>{
  const r=rule();r.validFrom="2026-02-30";save([r]);assert.throws(()=>reviewReference(user,r.id,1,"reviewed","Teste"));
  r.validFrom="2000-01-01";r.validUntil="2001-01-01";save([r]);assert.throws(()=>reviewReference(user,r.id,1,"reviewed","Teste"));
  r.validUntil="2099-12-31";r.sourceTitle="";save([r]);assert.throws(()=>reviewReference(user,r.id,1,"reviewed","Teste"));
  assert.ok(referenceIssues(r,"2026-10-11").length);r.sourceTitle="Fonte fictícia";save([r]);assert.throws(()=>reviewReference(user,r.id,2,"reviewed","Teste"));assert.throws(()=>reviewReference(user,r.id,1,"reviewed"," "));
});
test("referências: alterações de metadados e nova versão não herdam conferência",()=>{
  reviewReference(user,"rule-ficticia",1,"reviewed","Primeira conferência");const r=rule();r.sourceVersion="Exemplo 2";save([r]);assert.throws(()=>assertReferenceReviewed(user,r.id,tenant));
  r.status="superseded";const next={...r,id:"rule-ficticia-v2",version:2,status:"active" as const,previousRuleId:r.id};save([r,next]);assert.throws(()=>assertReferenceReviewed(user,next.id,tenant));assert.throws(()=>reviewReference(user,r.id,1,"reviewed","Antiga"));
  reviewReference(user,next.id,2,"reviewed","Nova conferência");assertReferenceReviewed(user,next.id,tenant);assert.equal(getReferenceGovernance(user).history.length,2);
});
