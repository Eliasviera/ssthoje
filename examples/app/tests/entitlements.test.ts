import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, truncateSync } from "node:fs";
import { join } from "node:path";
import { managePlan, getPlatformOverview } from "../src/lib/platform-store.ts";
import { DEFAULT_PLAN, type OptionalModule } from "../src/lib/plan-catalog.ts";
import { assertStorageCapacity, tenantStorageBytes, MB } from "../src/lib/storage-quota.ts";
import { requireTenantAccess } from "../src/lib/tenant-access.ts";
import { createThirdPartyInvitation, openThirdPartyPortal, receiveThirdPartyPdf, listThirdPartyInvitations } from "../src/lib/third-party-store.ts";
import { createEpiDelivery, issueEpiMockCode, confirmEpiMock, openEpiPortal, listEpiDeliveries } from "../src/lib/epi-store.ts";
import { setNotificationPreferences } from "../src/lib/operations-store.ts";
const original = process.cwd(), master = "sst-demo-master", admin = "sst-demo-user", tenantId = "tenant-horizonte";
const inviteInput = { companyId: "company-a", unitId: "unit-a", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", requested: ["PGR"], expiresInHours: 24 };
const pdf = new TextEncoder().encode("%PDF-1.4\nFictício\n%%EOF");
function configure(disabledModules: OptionalModule[], revision: number) { managePlan(master, tenantId, { operation: "configure", config: { ...DEFAULT_PLAN.config, disabledModules } }, "Teste fictício de módulos", revision); }
function physical(root: string, size: number) { const dir = join("data", root, tenantId); mkdirSync(dir, { recursive: true }); const path = join(dir, "old.pdf"); writeFileSync(path, ""); truncateSync(path, size); }
beforeEach(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "entitlements-tests-"))); mkdirSync("data");
  writeFileSync("data/clients.json", JSON.stringify([{ id: "company-a", tenantId, status: "active", tradeName: "Empresa fictícia", units: [{ id: "unit-a", name: "Unidade fictícia", cnpj: "12345678000195" }] }]));
  writeFileSync("data/workers.json", JSON.stringify([{ id: "worker-a", tenantId, companyId: "company-a", unitId: "unit-a", displayName: "Trabalhador fictício", status: "active" }]));
});
afterEach(() => process.chdir(original));
test("módulos: desativar bloqueia escrita por perfil e por link antigo, preserva leitura e isolamento", () => {
  const invite = createThirdPartyInvitation(admin, inviteInput), token = invite.link.split("#")[1];
  const epi = createEpiDelivery(admin, { workerId: "worker-a", deliveredOn: "2026-10-11", items: [{ name: "Luva fictícia", reference: "TESTE", size: "M", quantity: 1, ca:"32546", caValidUntil:"2030-10-10", caCheckedOn:"2026-10-11" }], notes: "" }), epiToken = epi.link.split("#")[1];
  const code = issueEpiMockCode(epiToken).code;
  configure(["thirdparty", "epi", "operations"], 0);
  for (const permission of ["thirdparty.manage", "epi.manage", "operations.manage"]) assert.equal(requireTenantAccess(admin, permission).ok, false);
  assert.equal(requireTenantAccess("sst-demo-user-b", "epi.manage").ok, true);
  assert.equal(requireTenantAccess("sst-demo-sst", "epi.manage").ok, false);
  assert.throws(() => createThirdPartyInvitation(admin, inviteInput));
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "ficticio.pdf", pdf), /desativadas/);
  assert.throws(() => issueEpiMockCode(epiToken), /desativadas/);
  assert.throws(() => confirmEpiMock(epiToken, code, true), /desativadas/);
  assert.throws(() => setNotificationPreferences(admin, { enabled: true, lookaheadDays: 3, categories: ["epi"] }), /desativadas/);
  assert.ok(openThirdPartyPortal(token)); assert.ok(openEpiPortal(epiToken));
  assert.equal(listThirdPartyInvitations(admin).length, 1); assert.equal(listEpiDeliveries(admin).length, 1);
  configure([], 1); receiveThirdPartyPdf(token, "PGR", "ficticio.pdf", pdf);
  assert.equal(confirmEpiMock(epiToken, code, true).status, "confirmed");
  assert.equal(getPlatformOverview(master).planEvents.length, 2);
});
test("armazenamento: soma áreas físicas e reserva, aceita fronteira exata e isola consultorias", () => {
  physical("document-files", 40 * MB); physical("third-party-files", 59 * MB);
  assert.equal(tenantStorageBytes(tenantId), 99 * MB);
  assert.doesNotThrow(() => assertStorageCapacity(tenantId, MB));
  assert.throws(() => assertStorageCapacity(tenantId, MB + 1), /Limite/);
  assert.equal(tenantStorageBytes("tenant-aurora"), 0);
  managePlan(master, tenantId, { operation: "consume", storageMB: 1, credits: 0 }, "Reserva fictícia", 0);
  assert.throws(() => assertStorageCapacity(tenantId, 1), /Limite/);
  assert.throws(() => managePlan(master, tenantId, { operation: "consume", storageMB: 1, credits: 0 }, "Excesso fictício", 1), /Saldo/);
  assert.throws(() => tenantStorageBytes("../tenant-aurora"));
  for (const bytes of [0, -1, NaN, 0.5]) assert.throws(() => assertStorageCapacity(tenantId, bytes));
});
test("armazenamento: portal não grava PDF nem recebimento acima da cota; downgrade preserva dados", () => {
  const invite = createThirdPartyInvitation(admin, inviteInput), token = invite.link.split("#")[1];
  physical("document-files", 100 * MB);
  const before = readFileSync("data/third-party.json", "utf8");
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "ficticio.pdf", pdf), /Limite/);
  assert.equal(readFileSync("data/third-party.json", "utf8"), before);
  assert.equal(tenantStorageBytes(tenantId), 100 * MB);
  managePlan(master, tenantId, { operation: "configure", config: { ...DEFAULT_PLAN.config, plan: "profissional" } }, "Aumento fictício", 0);
  receiveThirdPartyPdf(token, "PGR", "ficticio.pdf", pdf);
  assert.throws(() => managePlan(master, tenantId, { operation: "configure", config: DEFAULT_PLAN.config }, "Redução fictícia", 1), /uso atual/);
  assert.equal(tenantStorageBytes(tenantId), 100 * MB + pdf.byteLength);
});
