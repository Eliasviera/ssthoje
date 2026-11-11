import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInvite, findPendingInvite, listInvites, readInviteAccounts, revokeInvite } from "../src/lib/invite-store.ts";
import { createTrialAccount, extendTrial, isTrialActive, listTrialAccounts } from "../src/lib/trial-accounts.ts";
import { requireTenantAccess, listRuntimeTenants, listRuntimeMemberships } from "../src/lib/tenant-access.ts";
import { getTrialAdministration, manageTrialInvitation, registerTrialInvitation } from "../src/lib/trial-invite-service.ts";
import { verifyTrialPassword } from "../src/lib/trial-password.ts";
import { createClientCompany, listClientCompaniesForTenant } from "../src/lib/client-store.ts";
import { isTenantEnabled } from "../src/lib/tenant-state.ts";

// Pasta temporária mantida para inspeção do runner; nenhum dado do projeto é usado.
function isolated(run: () => void) {
  const original = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "sst-trial-invite-")));
  try { run(); } finally { process.chdir(original); }
}
const password = "senha-sintetica-teste-123";
function activate(email = "tester@example.invalid") {
  const { token } = createInvite({ label: "Teste fictício", actorUserId: "sst-demo-master" });
  return { token, account: createTrialAccount({ token, displayName: "Testador fictício", email, password }) };
}
test("ativação consome convite e cria ambiente próprio sem senha/token em texto puro", () => isolated(() => {
  const { token, account } = activate();
  assert.equal(findPendingInvite(token), null);
  assert.equal(readInviteAccounts().length, 1);
  assert.equal(new Date(account.expiresAt).getTime() - new Date(account.activatedAt).getTime(), 30 * 86400000);
  assert.equal(verifyTrialPassword(password, account.passwordHash), true);
  assert.equal(verifyTrialPassword("senha-incorreta", account.passwordHash), false);
  const raw = readFileSync("data/invites.json", "utf8");
  assert.equal(raw.includes(password), false);
  assert.equal(raw.includes(token), false);
  assert.equal(JSON.stringify(listInvites()).includes(account.passwordHash), false);
  assert.equal(JSON.stringify(listTrialAccounts()).includes(account.passwordHash), false);
  assert.throws(() => createTrialAccount({ token, displayName: "Outro", email: "other@example.invalid", password }), /indisponível/);
  assert.equal(requireTenantAccess(account.userId, "tenant.clients.manage").ok, true);
  assert.equal(listRuntimeTenants().some((tenant) => tenant.id === account.tenantId), true);
  assert.equal(listRuntimeMemberships().some((member) => member.userId === account.userId), true);
}));
test("contas não atravessam consultorias nem acessam Master; cadastros começam vazios", () => isolated(() => {
  const a = activate("a@example.invalid").account;
  const b = activate("b@example.invalid").account;
  assert.notEqual(a.tenantId, b.tenantId);
  for (const tenantId of [b.tenantId, "tenant-horizonte", "tenant-aurora"]) assert.equal(requireTenantAccess(a.userId, "tenant.clients.read", tenantId).ok, false);
  assert.equal(requireTenantAccess("sst-demo-user", "tenant.clients.read", a.tenantId).ok, false);
  assert.equal(requireTenantAccess(a.userId, "saas.tenants.manage").ok, false);
  assert.deepEqual(listClientCompaniesForTenant(a.tenantId), []);
  assert.deepEqual(listClientCompaniesForTenant(b.tenantId), []);
  const company = createClientCompany({ tenantId: a.tenantId, legalName: "Empresa fictícia", tradeName: "Teste", contactName: "Pessoa fictícia", contactEmail: "contact@example.invalid", contactPhone: "", units: [{ name: "Unidade fictícia", cnpj: "00000000000000", cityState: "Teste" }] });
  assert.equal(listClientCompaniesForTenant(a.tenantId)[0].id, company.id);
  assert.deepEqual(listClientCompaniesForTenant(b.tenantId), []);
  assert.deepEqual(listClientCompaniesForTenant("tenant-horizonte"), []);
  assert.throws(() => getTrialAdministration(a.userId), /Master/);
  for (const operation of ["create", "revoke", "extend"]) assert.throws(() => manageTrialInvitation(a.userId, { operation, value: b.userId }), /Master/);
}));
test("duplicidade e falhas de validação preservam convite e não deixam conta parcial", () => isolated(() => {
  activate();
  const { token } = createInvite({ label: "Outro", actorUserId: "sst-demo-master" });
  assert.throws(() => createTrialAccount({ token, displayName: "Outro", email: "tester@example.invalid", password }), /cadastrar/);
  assert.throws(() => createTrialAccount({ token, displayName: "Outro", email: "other@example.invalid", password: "curta" }), /senha/);
  assert.ok(findPendingInvite(token));
  assert.equal(readInviteAccounts().length, 1);
  writeFileSync("data/invites.lock", "", { flag: "wx" });
  assert.throws(() => createTrialAccount({ token, displayName: "Outro", email: "other@example.invalid", password }), /andamento/);
  unlinkSync("data/invites.lock");
  assert.ok(findPendingInvite(token));
  assert.equal(readInviteAccounts().length, 1);
}));
test("expirado e suspenso perdem autorização; extensão única fica auditada", () => isolated(() => {
  const { account } = activate();
  const records = JSON.parse(readFileSync("data/invites.json", "utf8"));
  records[0].account.expiresAt = "2000-01-01T00:00:00.000Z";
  writeFileSync("data/invites.json", JSON.stringify(records));
  assert.equal(requireTenantAccess(account.userId, "tenant.dashboard.read").ok, false);
  assert.equal(isTenantEnabled(account.tenantId), false);
  assert.equal(isTenantEnabled("trial-tenant-inexistente"), false);
  assert.equal(listRuntimeTenants().some((tenant) => tenant.id === account.tenantId), false);
  const extended = extendTrial(account.userId, new Date(), "sst-demo-master");
  assert.ok(isTrialActive(extended));
  assert.equal(requireTenantAccess(account.userId, "tenant.dashboard.read").ok, true);
  assert.throws(() => extendTrial(account.userId), /prorrogação/);
  const history = listInvites()[0].history!;
  assert.deepEqual(history.map((event) => event.action), ["created", "activated", "extended"]);
  assert.equal(history.at(-1)!.actorUserId, "sst-demo-master");
  writeFileSync("data/platform.json", JSON.stringify({ settings: { [account.tenantId]: { status: "suspended" } }, changes: [] }));
  assert.equal(requireTenantAccess(account.userId, "tenant.dashboard.read").ok, false);
}));
test("revogado, expirado, falta de confirmação e excesso de tentativas negam ativação", () => isolated(() => {
  const revoked = createInvite({ label: "Revogado", actorUserId: "sst-demo-master" });
  revokeInvite(revoked.invite.id);
  assert.throws(() => createTrialAccount({ token: revoked.token, displayName: "Teste", email: "x@example.invalid", password }), /indisponível/);
  const expired = createInvite({ label: "Expirado", actorUserId: "sst-demo-master", now: new Date("2000-01-01") });
  assert.throws(() => createTrialAccount({ token: expired.token, displayName: "Teste", email: "x@example.invalid", password }), /expirado/);
  const { token } = createInvite({ label: "Limite", actorUserId: "sst-demo-master" });
  const input = { token, displayName: "Teste", email: "x@example.invalid", password, acknowledged: false };
  for (let i = 0; i < 5; i++) assert.throws(() => registerTrialInvitation(input), /Confirme/);
  assert.throws(() => registerTrialInvitation({ ...input, acknowledged: true }), /Muitas tentativas/);
  assert.equal(readInviteAccounts().length, 0);
}));
