import assert from "node:assert/strict";
import test,{beforeEach,afterEach} from "node:test";
import {mkdirSync,mkdtempSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {getOperationsGovernance,changeOperationsPolicy,openOperationsIncident,advanceOperationsIncident,exportOperationsSnapshot} from "../src/lib/operations-governance.ts";
import {enqueueSandboxJob,processSandboxJob} from "../src/lib/job-sandbox.ts";
const original=process.cwd(),master="sst-demo-master";
beforeEach(()=>{mkdirSync(join(original,"data"),{recursive:true});process.chdir(mkdtempSync(join(original,"data","governance-tests-")));});
afterEach(()=>process.chdir(original));
test("governança: Master exclusivo e política validada/revisada preserva histórico",()=>{
  for(const user of ["","sst-demo-user","sst-demo-medico"]){assert.throws(()=>getOperationsGovernance(user));assert.throws(()=>changeOperationsPolicy(user,0,10,false,"Teste"));assert.throws(()=>openOperationsIncident(user,"Teste","Teste"));assert.throws(()=>exportOperationsSnapshot(user));}
  assert.equal(getOperationsGovernance(master).policy.hold,true);
  assert.throws(()=>changeOperationsPolicy(master,0,0,false,"Teste"));assert.throws(()=>changeOperationsPolicy(master,0,366,false,"Teste"));assert.throws(()=>changeOperationsPolicy(master,0,10,false," "));
  changeOperationsPolicy(master,0,10,false,"Teste fictício");assert.throws(()=>changeOperationsPolicy(master,0,20,true,"Antigo"));
  const db=getOperationsGovernance(master);assert.equal(db.changes.length,1);assert.equal(db.changes[0].before.hold,true);assert.equal(db.policy.revision,1);
});
test("governança: elegibilidade após evento final, bloqueio e tarefas em curso protegidas",t=>{
  let now=Date.now();t.mock.method(Date,"now",()=>now);
  enqueueSandboxJob(master,"tenant-horizonte","success","request-first","Teste");processSandboxJob(master);
  enqueueSandboxJob(master,"tenant-horizonte","success","request-second","Teste");
  changeOperationsPolicy(master,0,1,false,"Prazo fictício");now+=86400000;
  let db=getOperationsGovernance(master);assert.equal(db.retention.filter(r=>r.eligible).length,1);
  assert.ok(db.retention.some(r=>r.reason==="Tarefa ainda em andamento"));
  const file=readFileSync("data/job-sandbox.json","utf8");changeOperationsPolicy(master,1,1,true,"Preservar");db=getOperationsGovernance(master);assert.ok(db.retention.every(r=>!r.eligible));assert.equal(readFileSync("data/job-sandbox.json","utf8"),file);
});
test("governança: incidentes exigem transições/revisão e preservam etapas",()=>{
  const id=openOperationsIncident(master,"Incidente fictício","Abertura fictícia");
  assert.throws(()=>advanceOperationsIncident(master,id,0,"resolved","Pular"));
  advanceOperationsIncident(master,id,0,"investigating","Em análise");
  assert.throws(()=>advanceOperationsIncident(master,id,0,"resolved","Antigo"));
  advanceOperationsIncident(master,id,1,"resolved","Revisado");
  const i=getOperationsGovernance(master).incidents[0];assert.equal(i.status,"resolved");assert.deepEqual(i.history.map(h=>h.status),["open","investigating","resolved"]);
  assert.throws(()=>advanceOperationsIncident(master,id,2,"investigating","Reabrir"));
});
test("governança: exportação fechada com manifesto verificável sem textos privados",()=>{
  enqueueSandboxJob(master,"tenant-horizonte","success","request-private-key","justificativa-privada");
  openOperationsIncident(master,"titulo-privado","descricao-privada");
  const exported=exportOperationsSnapshot(master),serialized=JSON.stringify(exported);
  for(const secret of ["request-private-key","justificativa-privada","titulo-privado","descricao-privada"])assert.equal(serialized.includes(secret),false);
  assert.equal(exported.manifest.sha256,createHash("sha256").update(exported.payload).digest("hex"));assert.equal(exported.manifest.payloadBytes,Buffer.byteLength(exported.payload));
  const payload=JSON.parse(exported.payload);assert.equal(payload.scope,"operational_mock_only");assert.equal(payload.jobs.length,1);
});
