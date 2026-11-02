import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { managePlan, getPlatformOverview } from "../src/lib/platform-store.ts";
import { DEFAULT_PLAN } from "../src/lib/plan-catalog.ts";
import { getTenantSettings, assertTenantCapacity } from "../src/lib/tenant-state.ts";
const original = process.cwd(), master = "sst-demo-master", tenant = "tenant-horizonte";
const config = { ...DEFAULT_PLAN.config, plan: "profissional" as const, cycle: "annual" as const, extraCompanies: 2 };
beforeEach(() => { mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "plan-tests-"))); mkdirSync("data"); });
afterEach(() => process.chdir(original));
test("planos: autorização, alvo e revisão são obrigatórios", () => {
  assert.throws(() => managePlan("sst-demo-user", tenant, { operation: "configure", config }, "Teste", 0));
  assert.throws(() => managePlan(master, "forjado", { operation: "configure", config }, "Teste", 0));
  managePlan(master, tenant, { operation: "configure", config }, "Teste", 0);
  assert.throws(() => managePlan(master, tenant, { operation: "consume", credits: 1, storageMB: 0 }, "Teste", 0));
  assert.equal(getPlatformOverview(master).tenants[1].planAccount.revision, 0);
  assert.equal(getTenantSettings(tenant).companiesLimit, 302);
  assert.throws(() => assertTenantCapacity(tenant, "companies", 302));
});
test("planos: consumo exato, excesso atômico, histórico e downgrade", () => {
  managePlan(master, tenant, { operation: "configure", config }, "Plano fictício", 0);
  managePlan(master, tenant, { operation: "consume", credits: 500, storageMB: 500 }, "Consumo fictício", 1);
  const before = readFileSync("data/platform.json", "utf8");
  assert.throws(() => managePlan(master, tenant, { operation: "consume", credits: 1, storageMB: 0 }, "Excesso", 2));
  assert.throws(() => managePlan(master, tenant, { operation: "configure", config: DEFAULT_PLAN.config }, "Redução", 2));
  assert.equal(readFileSync("data/platform.json", "utf8"), before);
  const events = getPlatformOverview(master).planEvents;
  assert.equal(events.length, 2); assert.equal(events[0].before.creditsUsed, 0); assert.equal(events[0].after.creditsUsed, 500);
});
test("planos: validação e uso ativo não permitem reduzir ou adulterar saldo", () => {
  for (const value of [-1, 0.5, NaN, 9001]) assert.throws(() => managePlan(master, tenant, { operation: "configure", config: { ...config, extraCredits: value } }, "Teste", 0));
  assert.throws(() => managePlan(master, tenant, { operation: "configure", config: { ...config, plan: "__proto__" as typeof config.plan } }, "Teste", 0));
  assert.throws(() => managePlan(master, tenant, { operation: "consume", credits: -1, storageMB: 0 }, "Teste", 0));
  assert.throws(() => managePlan(master, tenant, { operation: "consume", credits: 0, storageMB: 0 }, "Teste", 0));
  writeFileSync("data/clients.json", JSON.stringify(Array.from({ length: 303 }, () => ({ tenantId: tenant, status: "active" }))));
  assert.throws(() => managePlan(master, tenant, { operation: "configure", config }, "Teste", 0));
});
