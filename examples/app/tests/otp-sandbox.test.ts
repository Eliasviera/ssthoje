import assert from "node:assert/strict";
import test,{beforeEach,afterEach} from "node:test";
import {mkdirSync,mkdtempSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {issueSandboxOtp,verifySandboxOtp,listSandboxOtps} from "../src/lib/otp-sandbox.ts";
const original=process.cwd(),master="sst-demo-master",tenant="tenant-horizonte";
beforeEach(()=>{mkdirSync(join(original,"data"),{recursive:true});process.chdir(mkdtempSync(join(original,"data","otp-tests-")));});
afterEach(()=>process.chdir(original));
test("OTP fictício: Master e consultoria exigidos; confirmação única e sem código na persistência",()=>{
  assert.throws(()=>issueSandboxOtp("sst-demo-user",tenant));assert.throws(()=>issueSandboxOtp(master,"inexistente"));
  const challenge=issueSandboxOtp(master,tenant);assert.match(challenge.code,/^\d{6}$/);
  const stored=JSON.parse(readFileSync("data/otp-sandbox.json","utf8"));assert.equal("code" in stored[0],false);assert.notEqual(stored[0].digest,challenge.code);
  assert.throws(()=>verifySandboxOtp("sst-demo-user",tenant,challenge.id,challenge.code));
  assert.throws(()=>verifySandboxOtp(master,"tenant-aurora",challenge.id,challenge.code));
  verifySandboxOtp(master,tenant,challenge.id,challenge.code);assert.equal(listSandboxOtps(master)[0].status,"verified");
  assert.throws(()=>verifySandboxOtp(master,tenant,challenge.id,challenge.code),/encerrado/);
  const projection=listSandboxOtps(master)[0];assert.equal("digest" in projection,false);assert.equal("salt" in projection,false);
});
test("OTP fictício: quinta tentativa incorreta bloqueia inclusive código correto",()=>{
  const c=issueSandboxOtp(master,tenant),wrong=c.code==="000000"?"000001":"000000";
  for(let i=0;i<5;i++)assert.throws(()=>verifySandboxOtp(master,tenant,c.id,wrong));
  assert.equal(listSandboxOtps(master)[0].status,"locked");assert.equal(listSandboxOtps(master)[0].attempts,5);
  assert.throws(()=>verifySandboxOtp(master,tenant,c.id,c.code),/encerrado/);
});
test("OTP fictício: expiração e substituição preservam histórico e isolamento",t=>{
  const first=issueSandboxOtp(master,tenant),second=issueSandboxOtp(master,tenant);
  assert.equal(listSandboxOtps(master).find(r=>r.id===first.id)?.status,"superseded");
  assert.throws(()=>verifySandboxOtp(master,tenant,first.id,first.code));
  const other=issueSandboxOtp(master,"tenant-aurora");assert.equal(listSandboxOtps(master).find(r=>r.id===second.id)?.status,"pending");
  t.mock.method(Date,"now",()=>second.expiresAt);
  assert.throws(()=>verifySandboxOtp(master,tenant,second.id,second.code),/expirado/);
  assert.equal(listSandboxOtps(master).find(r=>r.id===second.id)?.status,"expired");
  assert.ok(listSandboxOtps(master).some(r=>r.id===other.id));
});
