import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changeTenantSettings as changeSettings, diagnoseTenant, getPlatformOverview } from "../src/lib/platform-store.ts";
import { assertTenantCapacity, getTenantSettings } from "../src/lib/tenant-state.ts";
import { requireTenantAccess } from "../src/lib/tenant-access.ts";
import { getOperationsOverview } from "../src/lib/operations-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
import { createThirdPartyInvitation, openThirdPartyPortal } from "../src/lib/third-party-store.ts";
import { createEpiDelivery, openEpiPortal, issueEpiMockCode } from "../src/lib/epi-store.ts";
import type { TenantSettings } from "../src/lib/tenant-state.ts";

const original = process.cwd(), master = "sst-demo-master", admin = "sst-demo-user", tenantId = "tenant-horizonte";
const file = (name: string) => join(process.cwd(), "data", name);
function save(name: string, value: unknown) { writeFileSync(file(name), JSON.stringify(value)); }
function changeTenantSettings(userId: string, id: string, input: TenantSettings, reason: string, expected = JSON.stringify(getTenantSettings(id))) { return changeSettings(userId, id, input, reason, expected); }
beforeEach(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "platform-tests-"))); mkdirSync("data");
  save("clients.json", [{ id: "company-a", tenantId, tradeName: "NOME_CLIENTE_RESTRITO", contactEmail: "CONTATO_RESTRITO", status: "active", units: [{ id: "unit-a", name: "Unidade fictícia", cnpj: "12345678000195" }] }, { id: "archived", tenantId, status: "archived" }, { id: "other", tenantId: "tenant-aurora", status: "active" }]);
  save("workers.json", [{ id: "worker-a", tenantId, companyId: "company-a", unitId: "unit-a", displayName: "NOME_TRABALHADOR_RESTRITO", status: "active", riskCategories: ["RISCO_RESTRITO"] }]);
  save("aso.json", { content: "SAUDE_RESTRITA" }); save("documents.json", [{ tenantId, title: "DOCUMENTO_RESTRITO", token: "TOKEN_RESTRITO" }]);
});
afterEach(() => process.chdir(original));
test("plataforma: somente Master consulta e administra; negação auditada sem conceder vínculo", () => {
  for (const user of ["", "desconhecido", admin, "sst-demo-sst", "sst-demo-medico", "sst-demo-user-b"]) {
    assert.throws(() => getPlatformOverview(user));
    assert.throws(() => changeTenantSettings(user, tenantId, { status: "suspended", companiesLimit: 10, workersLimit: 10 }, "Teste fictício"));
    assert.throws(() => diagnoseTenant(user, tenantId, "Teste fictício"));
  }
  assert.equal(requireTenantAccess(master, "tenant.dashboard.read").ok, false);
  assert.equal(requireTenantAccess(master, "documents.read", tenantId).ok, false);
  assert.equal(requireTenantAccess(master, "aso.manage", tenantId).ok, false);
  assert.ok(listAuditEventsForTenant("platform").every(e => e.action === "platform.access_denied"));
  assert.equal(getPlatformOverview(master).tenants.length, 2);
});
test("plataforma: projeção administrativa e suporte retornam apenas contagens e configuração", () => {
  const overview = getPlatformOverview(master), diagnosis = diagnoseTenant(master, tenantId, "Diagnóstico fictício M15");
  assert.deepEqual(diagnosis.usage, { companies: 1, workers: 1, members: 5 });
  for (const secret of ["NOME_CLIENTE_RESTRITO", "CONTATO_RESTRITO", "NOME_TRABALHADOR_RESTRITO", "RISCO_RESTRITO", "SAUDE_RESTRITA", "DOCUMENTO_RESTRITO", "TOKEN_RESTRITO"]) assert.equal(JSON.stringify({ overview, diagnosis }).includes(secret), false);
  assert.equal(getPlatformOverview(master).supportChecks[0].reason, "Diagnóstico fictício M15");
  assert.throws(() => diagnoseTenant(master, "tenant-forjado", "Teste"));
  assert.throws(() => diagnoseTenant(master, tenantId, " "));
});
test("plataforma: validação rejeita estado, limites e justificativas inválidos sem persistir", () => {
  const valid = { status: "active" as const, companiesLimit: 10, workersLimit: 10 };
  for (const input of [{ ...valid, status: "closed" }, { ...valid, companiesLimit: 0 }, { ...valid, workersLimit: 1.5 }, { ...valid, workersLimit: 100001 }, { ...valid, companiesLimit: NaN }]) assert.throws(() => changeTenantSettings(master, tenantId, input as typeof valid, "Teste fictício"));
  for (const reason of ["", " ", "x".repeat(601)]) assert.throws(() => changeTenantSettings(master, tenantId, valid, reason));
  assert.throws(() => changeTenantSettings(master, "tenant-forjado", valid, "Teste fictício"));
  assert.deepEqual(getTenantSettings(tenantId), { status: "active", companiesLimit: 100, workersLimit: 1000 });
});
test("plataforma: alteração mantém antes/depois e isolamento sem apagar dados", () => {
  const source = readFileSync(file("clients.json"), "utf8");
  changeTenantSettings(master, tenantId, { status: "suspended", companiesLimit: 5, workersLimit: 5 }, "Suspensão fictícia");
  assert.equal(requireTenantAccess(admin, "tenant.dashboard.read").ok, false);
  assert.equal(requireTenantAccess("sst-demo-medico", "aso.manage").ok, false);
  assert.equal(requireTenantAccess("sst-demo-user-b", "tenant.dashboard.read").ok, true);
  assert.throws(() => getOperationsOverview(admin));
  changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 5, workersLimit: 5 }, "Reativação fictícia");
  assert.equal(requireTenantAccess(admin, "tenant.dashboard.read").ok, true);
  assert.equal(readFileSync(file("clients.json"), "utf8"), source);
  const history = getPlatformOverview(master).changes;
  assert.equal(history.length, 2); assert.equal(history[1].before.status, "active"); assert.equal(history[1].after.status, "suspended");
  assert.equal(history[0].before.status, "suspended"); assert.equal(history[0].after.status, "active");
});
test("plataforma: limites protegem capacidade ativa, não reduzem abaixo do uso e não afetam outro tenant", () => {
  changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 1, workersLimit: 1 }, "Limites fictícios");
  assert.throws(() => assertTenantCapacity(tenantId, "companies", 1), /Limite/);
  assert.throws(() => assertTenantCapacity(tenantId, "workers", 1), /Limite/);
  assert.doesNotThrow(() => assertTenantCapacity("tenant-aurora", "companies", 1));
  assert.doesNotThrow(() => assertTenantCapacity(tenantId, "workers", 0));
  save("workers.json", [{ tenantId, status: "active" }, { tenantId, status: "active" }]);
  assert.throws(() => changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 2, workersLimit: 1 }, "Limite inválido"), /abaixo do uso/);
  assert.equal(getTenantSettings(tenantId).companiesLimit, 1);
  assert.throws(() => changeTenantSettings(master, tenantId, getTenantSettings(tenantId), "Sem mudança"));
});
test("plataforma: suspensão bloqueia links de terceiros e EPI e reativação preserva os fluxos", () => {
  const invite = createThirdPartyInvitation(admin, { companyId: "company-a", unitId: "unit-a", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", requested: ["PGR"], expiresInHours: 24 });
  const epi = createEpiDelivery(admin, { workerId: "worker-a", deliveredOn: "2026-10-10", items: [{ name: "Luva fictícia", reference: "TESTE", size: "M", quantity: 1, ca:"32546", caValidUntil:"2030-10-10", caCheckedOn:"2026-10-10" }], notes: "" });
  const inviteToken = invite.link.split("#")[1], epiToken = epi.link.split("#")[1];
  assert.ok(openThirdPartyPortal(inviteToken)); assert.ok(openEpiPortal(epiToken));
  changeTenantSettings(master, tenantId, { status: "suspended", companiesLimit: 10, workersLimit: 10 }, "Teste fictício de suspensão");
  assert.throws(() => openThirdPartyPortal(inviteToken)); assert.throws(() => openEpiPortal(epiToken)); assert.throws(() => issueEpiMockCode(epiToken));
  assert.throws(() => assertTenantCapacity(tenantId, "companies", 0), /suspensa/);
  changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 10, workersLimit: 10 }, "Restauração fictícia");
  assert.ok(openThirdPartyPortal(inviteToken)); assert.ok(openEpiPortal(epiToken));
});
test("plataforma: auditoria separada preserva eventos sem justificativa ou dados de suporte", () => {
  changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 5, workersLimit: 5 }, "JUSTIFICATIVA_RESTRITA");
  diagnoseTenant(master, tenantId, "SUPORTE_RESTRITO");
  const events = listAuditEventsForTenant("platform");
  assert.ok(events.some(e => e.action === "platform.settings_changed")); assert.ok(events.some(e => e.action === "platform.support_diagnosed"));
  assert.equal(JSON.stringify(events).includes("JUSTIFICATIVA_RESTRITA"), false); assert.equal(JSON.stringify(events).includes("SUPORTE_RESTRITO"), false);
  assert.deepEqual(listAuditEventsForTenant(tenantId), []);
});
test("plataforma: limite de ações administrativas é aplicado no serviço", () => {
  for (let index = 0; index < 20; index++) diagnoseTenant(master, tenantId, "Consulta fictícia");
  assert.throws(() => diagnoseTenant(master, tenantId, "Consulta excedente"), /Muitas ações/);
});
test("plataforma: formulário antigo não sobrescreve configuração mais recente", () => {
  const before = JSON.stringify(getTenantSettings(tenantId));
  changeTenantSettings(master, tenantId, { status: "active", companiesLimit: 5, workersLimit: 5 }, "Primeira alteração");
  assert.throws(() => changeTenantSettings(master, tenantId, { status: "suspended", companiesLimit: 10, workersLimit: 10 }, "Formulário antigo", before), /configuração mudou/);
  assert.equal(getTenantSettings(tenantId).status, "active"); assert.equal(getTenantSettings(tenantId).companiesLimit, 5);
  assert.equal(getPlatformOverview(master).changes.length, 1);
});
