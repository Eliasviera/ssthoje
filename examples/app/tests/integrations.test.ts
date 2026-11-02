import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runIntegrationSandbox, getIntegrationSandbox } from "../src/lib/integration-store.ts";
import { signFixture, verifyFixture } from "../src/lib/integration-adapters.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
const original = process.cwd(), master = "sst-demo-master", tenant = "tenant-horizonte";
beforeEach(() => { mkdirSync(join(original,"data"),{recursive:true}); process.chdir(mkdtempSync(join(original,"data","integration-tests-"))); });
afterEach(() => process.chdir(original));
test("integrações: Master exclusivo e entradas inválidas não persistem", () => {
  for (const user of ["", "sst-demo-user", "sst-demo-user-b", "sst-demo-medico"]) {
    assert.throws(() => getIntegrationSandbox(user));
    assert.throws(() => runIntegrationSandbox(user,tenant,"ai","success","request-123","Teste"));
  }
  assert.throws(() => runIntegrationSandbox(master,"tenant-inexistente","ai","success","request-123","Teste"));
  assert.throws(() => runIntegrationSandbox(master,tenant,"ai","success","bad","Teste"));
  assert.throws(() => runIntegrationSandbox(master,tenant,"ai","success","request-123"," "));
  assert.equal(existsSync("data/integration-sandbox.json"),false);
});
test("integrações: assinatura é verificada sobre os bytes e rejeita alterações", () => {
  const body = '{"id":"ficticio"}', secret = "segredo-apenas-do-teste";
  const sig = signFixture(body,secret);
  assert.ok(verifyFixture(body,sig,secret));
  for (const [b,s,k] of [[body+" ",sig,secret],[body,sig,"outro"],[body,"zz",secret],[body,"0".repeat(64),secret],[body,sig,""]]) assert.equal(verifyFixture(b,s,k),false);
});
test("integrações: três adapters simulados e duplicação sem segundo processamento", () => {
  for (const kind of ["email_otp","billing","ai"] as const) {
    runIntegrationSandbox(master,tenant,kind,"duplicate",`request-${kind.replaceAll("_", "-")}`,"Teste fictício");
    const run = getIntegrationSandbox(master)[0];
    assert.equal(run.state,"completed"); assert.equal(run.result?.state,"simulated");
    assert.deepEqual(run.events.map(e=>e.state),["accepted","duplicate"]);
  }
  assert.equal(existsSync("data/billing.json"),false); assert.equal(existsSync("data/platform.json"),false);
  const log = readFileSync("data/audit-log.jsonl","utf8");
  assert.equal(log.includes("Teste fictício"),false); assert.equal(log.includes("signature"),false);
  assert.ok(listAuditEventsForTenant("platform").some(e=>e.action === "platform.integration_run"));
});
test("integrações: recusa e falha não produzem resultado; idempotência persiste e separa consultorias", () => {
  runIntegrationSandbox(master,tenant,"billing","invalid_signature","request-123","Teste");
  runIntegrationSandbox(master,tenant,"ai","failure","request-123","Teste");
  let runs = getIntegrationSandbox(master);
  assert.deepEqual(runs.map(r=>r.state),["failed","rejected"]); assert.ok(runs.every(r=>!r.result));
  const before = readFileSync("data/integration-sandbox.json","utf8");
  assert.equal(runIntegrationSandbox(master,tenant,"ai","failure","request-123","Reenvio").repeated,true);
  assert.equal(readFileSync("data/integration-sandbox.json","utf8"),before);
  assert.throws(()=>runIntegrationSandbox(master,tenant,"ai","success","request-123","Mudança"));
  runIntegrationSandbox(master,"tenant-aurora","ai","success","request-123","Outra consultoria");
  runs = getIntegrationSandbox(master); assert.equal(runs.length,3);
  runs[0].reason = "Modificado"; assert.notEqual(getIntegrationSandbox(master)[0].reason,"Modificado");
});
