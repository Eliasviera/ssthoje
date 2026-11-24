import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getBillingOverview, manageBilling } from "../src/lib/billing-store.ts";
import { managePlan, changeTenantSettings } from "../src/lib/platform-store.ts";
import { DEFAULT_PLAN } from "../src/lib/plan-catalog.ts";
import { getTenantSettings, readPlatformState } from "../src/lib/tenant-state.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
import type { BillingAction, BillingCommand } from "../src/lib/billing-types.ts";
const original = process.cwd(), master = "sst-demo-master", admin = "sst-demo-user", tenant = "tenant-horizonte";
function account() { return getBillingOverview(master)[tenant]; }
function command(action: BillingAction, rest: Partial<BillingCommand> = {}): BillingCommand { return { action, reason: "Teste fictício M17", requestId: randomUUID(), expectedRevision: account().revision, expectedPlanRevision: readPlatformState().plans?.[tenant]?.revision ?? 0, ...rest }; }
function run(action: BillingAction, rest: Partial<BillingCommand> = {}) { return manageBilling(master, tenant, command(action, rest)); }
beforeEach(() => { mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "billing-tests-"))); mkdirSync("data"); });
afterEach(() => process.chdir(original));
test("billing: Master exclusivo, alvo/identificador forjados e entradas inválidas são recusados", () => {
  for (const user of [admin, "sst-demo-medico", "sst-demo-user-b", "", "forjado"]) {
    assert.throws(() => getBillingOverview(user)); assert.throws(() => manageBilling(user, tenant, command("start")));
  }
  assert.throws(() => manageBilling(master, "forjado", command("start")));
  for (const rest of [{ action: "__proto__" }, { reason: " " }, { expectedRevision: -1 }, { requestId: "x" }, { expectedPlanRevision: 99 }]) assert.throws(() => manageBilling(master, tenant, command("start", rest as Partial<BillingCommand>)));
  run("start"); const invoice = account().invoices[0];
  assert.throws(() => manageBilling(master, "tenant-aurora", command("paid", { expectedRevision: 0, invoiceId: invoice.id })));
  assert.equal(getBillingOverview(master)["tenant-aurora"].invoices.length, 0);
  assert.ok(listAuditEventsForTenant("platform").some(e => e.action === "platform.access_denied"));
});
test("billing: repetição idêntica não duplica; mesma chave adulterada e formulário antigo falham", () => {
  const start = command("start"); manageBilling(master, tenant, start);
  assert.equal(manageBilling(master, tenant, start).duplicate, true);
  assert.equal(account().invoices.length, 1); assert.equal(account().events.length, 1);
  assert.throws(() => manageBilling(master, tenant, { ...start, reason: "Alterado" }), /outros valores/);
  assert.throws(() => run("cancel", { expectedRevision: 0 }), /mudou/);
  const invoiceId = account().invoices[0].id, paid = command("paid", { invoiceId });
  manageBilling(master, tenant, paid); manageBilling(master, tenant, paid);
  assert.equal(account().events.length, 2); assert.equal(account().invoices[0].status, "paid");
});
test("billing: falha, reabertura, pagamento e estorno integral preservam estados e centavos", () => {
  run("start"); const invoiceId = account().invoices[0].id;
  assert.equal(account().invoices[0].amountCents, 19900);
  assert.throws(() => run("refund", { invoiceId })); assert.throws(() => run("issue"));
  run("failed", { invoiceId }); assert.equal(account().invoices[0].status, "failed");
  run("retry", { invoiceId }); run("paid", { invoiceId }); run("refund", { invoiceId });
  assert.equal(account().invoices[0].status, "refunded");
  assert.throws(() => run("paid", { invoiceId }));
  assert.deepEqual(account().events.map(e => e.after), ["pending", "failed", "pending", "paid", "refunded"]);
  assert.equal(account().events.at(-1)?.amountCents, 19900);
});
test("billing: disputas, cancelamento e nova assinatura mantêm cobranças anteriores e acessos", () => {
  run("start"); const invoiceId = account().invoices[0].id;
  run("paid", { invoiceId }); run("dispute", { invoiceId });
  assert.throws(() => run("issue")); run("dispute_won", { invoiceId });
  run("dispute", { invoiceId }); run("dispute_lost", { invoiceId }); run("cancel");
  assert.throws(() => run("issue")); assert.equal(getTenantSettings(tenant).status, "active");
  run("start"); assert.equal(account().subscriptions.length, 2); assert.equal(account().subscriptions[0].status, "canceled");
  assert.equal(account().invoices[0].status, "refunded"); assert.equal(account().invoices.length, 2);
});
test("billing: reconciliação registra igualdade/divergência sem mudar cobrança; valores inválidos falham", () => {
  run("start"); const invoiceId = account().invoices[0].id;
  assert.equal(run("reconcile", { invoiceId, referenceStatus: "pending", referenceAmountCents: 19900 }).matched, true);
  assert.equal(run("reconcile", { invoiceId, referenceStatus: "paid", referenceAmountCents: 19900 }).matched, false);
  assert.equal(run("reconcile", { invoiceId, referenceStatus: "pending", referenceAmountCents: 19901 }).matched, false);
  const before = readFileSync("data/billing.json", "utf8");
  for (const referenceAmountCents of [-1, 0.5, NaN, 100000001]) assert.throws(() => run("reconcile", { invoiceId, referenceStatus: "paid", referenceAmountCents }));
  assert.equal(account().invoices[0].status, "pending"); assert.equal(readFileSync("data/billing.json", "utf8"), before);
  assert.equal(account().events.filter(e => e.matched === false).length, 2);
});
test("billing: snapshot preserva cobrança antiga e rejeita plano desatualizado; suspensão bloqueia nova emissão", () => {
  run("start"); const invoiceId = account().invoices[0].id; run("paid", { invoiceId });
  const old = command("issue");
  managePlan(master, tenant, { operation: "configure", config: { ...DEFAULT_PLAN.config, plan: "profissional", cycle: "annual" } }, "Plano fictício anual", 0);
  assert.throws(() => manageBilling(master, tenant, old), /plano mudou/);
  run("issue"); assert.equal(account().invoices[0].amountCents, 19900); assert.equal(account().invoices[1].amountCents, 299000);
  run("cancel"); run("paid", { invoiceId: account().invoices[1].id });
  const settings = getTenantSettings(tenant); changeTenantSettings(master, tenant, { ...settings, status: "suspended" }, "Suspensão fictícia", JSON.stringify(settings));
  assert.throws(() => run("start"), /Reative/);
});
