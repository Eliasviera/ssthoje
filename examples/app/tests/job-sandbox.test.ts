import assert from "node:assert/strict";
import test,{beforeEach,afterEach} from "node:test";
import {mkdirSync,mkdtempSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {enqueueSandboxJob,processSandboxJob,deliverSandboxOutbox,getJobSandbox} from "../src/lib/job-sandbox.ts";
const original=process.cwd(),master="sst-demo-master",tenant="tenant-horizonte";
beforeEach(()=>{mkdirSync(join(original,"data"),{recursive:true});process.chdir(mkdtempSync(join(original,"data","job-tests-")));});
afterEach(()=>process.chdir(original));
test("fila: autorização, validação e chave idempotente por consultoria",()=>{
  for(const user of ["","sst-demo-user","sst-demo-medico"]){assert.throws(()=>getJobSandbox(user));assert.throws(()=>enqueueSandboxJob(user,tenant,"success","request-123","Teste"));assert.throws(()=>processSandboxJob(user));assert.throws(()=>deliverSandboxOutbox(user));}
  assert.throws(()=>enqueueSandboxJob(master,"inexistente","success","request-123","Teste"));
  assert.throws(()=>enqueueSandboxJob(master,tenant,"success","bad","Teste"));
  const id=enqueueSandboxJob(master,tenant,"success","request-123","Teste");
  assert.equal(enqueueSandboxJob(master,tenant,"success","request-123","Teste"),id);
  assert.throws(()=>enqueueSandboxJob(master,tenant,"permanent","request-123","Teste"));
  enqueueSandboxJob(master,"tenant-aurora","success","request-123","Teste");assert.equal(getJobSandbox(master).jobs.length,2);
});
test("fila: conclusão e caixa de saída persistidas juntas; entrega local idempotente",()=>{
  enqueueSandboxJob(master,tenant,"success","request-123","Teste");processSandboxJob(master);
  const db=getJobSandbox(master);assert.equal(db.jobs[0].status,"completed");assert.equal(db.outbox.length,1);assert.equal(db.outbox[0].jobId,db.jobs[0].id);
  processSandboxJob(master);assert.equal(getJobSandbox(master).outbox.length,1);
  deliverSandboxOutbox(master);const before=readFileSync("data/job-sandbox.json","utf8");deliverSandboxOutbox(master);assert.equal(readFileSync("data/job-sandbox.json","utf8"),before);
  assert.equal(getJobSandbox(master).outbox[0].status,"delivered_local");
});
test("fila: falha temporária respeita intervalos e termina na terceira tentativa",t=>{
  let now=Date.now();t.mock.method(Date,"now",()=>now);
  enqueueSandboxJob(master,tenant,"transient","request-123","Teste");processSandboxJob(master);
  assert.equal(getJobSandbox(master).jobs[0].nextAt,now+5000);processSandboxJob(master);assert.equal(getJobSandbox(master).jobs[0].attempts,1);
  now+=5000;processSandboxJob(master);assert.equal(getJobSandbox(master).jobs[0].nextAt,now+10000);
  now+=10000;processSandboxJob(master);const db=getJobSandbox(master);assert.equal(db.jobs[0].status,"completed");assert.equal(db.jobs[0].attempts,3);assert.equal(db.outbox.length,1);assert.equal(db.jobs[0].history.length,4);
});
test("fila: falha permanente preservada após três tentativas sem evento de sucesso",t=>{
  let now=Date.now();t.mock.method(Date,"now",()=>now);
  enqueueSandboxJob(master,tenant,"permanent","request-123","Teste");processSandboxJob(master);now+=5000;processSandboxJob(master);now+=10000;processSandboxJob(master);
  let db=getJobSandbox(master);assert.equal(db.jobs[0].status,"dead");assert.equal(db.outbox.length,0);
  now+=60000;processSandboxJob(master);db=getJobSandbox(master);assert.equal(db.jobs[0].attempts,3);assert.equal(db.jobs[0].history.length,4);
});
