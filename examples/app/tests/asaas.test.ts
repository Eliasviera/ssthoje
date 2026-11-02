import assert from "node:assert/strict";
import test,{beforeEach,afterEach} from "node:test";
import {mkdirSync,mkdtempSync,readdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {receiveAsaas,listAsaasInbox,authenticateAsaas,exerciseAsaasInbox,type AsaasConfig} from "../src/lib/asaas-inbox.ts";
import {handleAsaasWebhook} from "../src/lib/asaas-handler.ts";
const original=process.cwd(), master="sst-demo-master";
const c:AsaasConfig={enabled:true,token:"test-token-very-long-and-only-fictitious",tenantId:"tenant-horizonte",paymentId:"pay_test123"};
const fixture=()=>({id:"evt_test123&01",event:"PAYMENT_RECEIVED",payment:{id:c.paymentId,value:1},tenantId:"tenant-aurora",privateData:"must-not-persist"});
const envNames=["SST_ASAAS_SANDBOX_ENABLED","SST_ASAAS_WEBHOOK_TOKEN","SST_ASAAS_SANDBOX_TENANT_ID","SST_ASAAS_SANDBOX_PAYMENT_ID"];
let saved:(string|undefined)[];
beforeEach(()=>{mkdirSync(join(original,"data"),{recursive:true});process.chdir(mkdtempSync(join(original,"data","asaas-tests-")));saved=envNames.map(n=>process.env[n]);envNames.forEach(n=>delete process.env[n]);});
afterEach(()=>{process.chdir(original);envNames.forEach((n,i)=>{if(saved[i]===undefined) delete process.env[n];else process.env[n]=saved[i];});});
function configure(){process.env.SST_ASAAS_SANDBOX_ENABLED="true";process.env.SST_ASAAS_WEBHOOK_TOKEN=c.token;process.env.SST_ASAAS_SANDBOX_TENANT_ID=c.tenantId;process.env.SST_ASAAS_SANDBOX_PAYMENT_ID=c.paymentId;}
function request(body:unknown,token=c.token){return new Request("http://localhost/api/webhooks/asaas",{method:"POST",headers:{"content-type":"application/json","asaas-access-token":token},body:JSON.stringify(body)});}
test("asaas: receptor desativado por padrão e token obrigatório antes da persistência",async()=>{
  assert.equal((await handleAsaasWebhook(request(fixture()))).status,503);configure();
  assert.equal(authenticateAsaas("incorreto",c),false);assert.equal(authenticateAsaas(c.token,c),true);
  assert.equal((await handleAsaasWebhook(request(fixture(),"incorreto"))).status,401);
  assert.equal(existsSync("data/asaas-inbox"),false);
  const first=await handleAsaasWebhook(request(fixture()));assert.equal(first.status,200);assert.deepEqual(await first.json(),{received:true,duplicate:false});
  const second=await handleAsaasWebhook(request(fixture()));assert.deepEqual(await second.json(),{received:true,duplicate:true});
});
test("asaas: IDs duráveis entre processos, conflito e campos privados descartados",()=>{
  receiveAsaas(fixture(),c,"asaas_sandbox");
  const fileUrl=new URL("../src/lib/asaas-inbox.ts",import.meta.url).href;
  const code=`import {receiveAsaas} from ${JSON.stringify(fileUrl)}; const r=receiveAsaas(${JSON.stringify(fixture())},${JSON.stringify(c)},'asaas_sandbox'); if(!r.duplicate) process.exit(2);`;
  const child=spawnSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",code],{cwd:process.cwd(),encoding:"utf8"});assert.equal(child.status,0,child.stderr);
  assert.equal(readdirSync("data/asaas-inbox").length,1);
  assert.throws(()=>receiveAsaas({...fixture(),payment:{id:c.paymentId,value:2}},c,"asaas_sandbox"),/reutilizado/);
  const records=listAsaasInbox(master);assert.equal(records[0].tenantId,c.tenantId);assert.equal(JSON.stringify(records).includes("must-not-persist"),false);
  assert.equal(existsSync("data/billing.json"),false);
});
test("asaas: cobrança sem vínculo, divergência e tipo desconhecido ficam para revisão",()=>{
  for(const [id,event,payment,state] of [
    ["evt_1","PAYMENT_RECEIVED",{id:"pay_other",value:1},"unmapped"],
    ["evt_2","PAYMENT_RECEIVED",{id:c.paymentId,value:2},"amount_mismatch"],
    ["evt_3","PAYMENT_NEW_EVENT",{id:c.paymentId,value:1},"unsupported"],
  ] as const){const result=receiveAsaas({id,event,payment},c,"asaas_sandbox");assert.equal(result.event.state,state);}
  assert.equal(listAsaasInbox(master).length,3);
});
test("asaas: corpo inválido e limites HTTP não gravam eventos",async()=>{
  configure();for(const body of [null,{}, {...fixture(),payment:{id:c.paymentId,value:1.001}}]) assert.equal((await handleAsaasWebhook(request(body))).status,400);
  assert.equal((await handleAsaasWebhook(request({payload:"x".repeat(33000)}))).status,413);
  assert.equal((await handleAsaasWebhook(new Request("http://localhost",{method:"POST",headers:{"asaas-access-token":c.token,"content-type":"text/plain"},body:"{}"}))).status,415);
  assert.equal(existsSync("data/asaas-inbox"),false);
});
test("asaas: bancada Master e reenvio local não duplicam evento",()=>{
  assert.throws(()=>listAsaasInbox("sst-demo-user"));assert.throws(()=>exerciseAsaasInbox("sst-demo-user",false));
  assert.throws(()=>exerciseAsaasInbox(master,true));assert.equal(exerciseAsaasInbox(master,false),false);assert.equal(exerciseAsaasInbox(master,true),true);
  assert.equal(listAsaasInbox(master).length,1);
});
