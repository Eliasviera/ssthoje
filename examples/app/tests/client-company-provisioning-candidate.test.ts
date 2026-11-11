import assert from "node:assert/strict";
import test from "node:test";
import { provisionClientCompanyCandidate, type ClientProvisioningAdapter, type ClientProvisioningTransaction, type ProvisioningEvent } from "../src/lib/client-company-provisioning-candidate.ts";
import { canAccessCompanyResource, type ClientCompanyBinding } from "../src/lib/client-company-scope.ts";

function fixture() {
  const state = { bindings: [] as ClientCompanyBinding[], events: [] as ProvisioningEvent[], memberships: [] as { tenantId: string; userId: string; role: string; status: string }[] };
  const controls = { actor: { userId: "admin-test", tenantId: "tenant-test" } as { userId: string; tenantId: string } | null,
    authorized: true, verified: true, master: false, activeCompany: true, failAudit: false };
  const adapter: ClientProvisioningAdapter = {
    async authenticatedActor() { return controls.actor; },
    async transaction(run) {
      const draft = structuredClone(state);
      const tx: ClientProvisioningTransaction = {
        async canProvision(actor, tenant, company) { return controls.authorized && actor === "admin-test" && tenant === "tenant-test" && ["company-a", "company-b"].includes(company); },
        async getVerifiedIdentity(userId) { return { userId, verified: controls.verified, platformMaster: controls.master }; },
        async getMembership(tenantId, userId) { return draft.memberships.find((row) => row.tenantId === tenantId && row.userId === userId) ?? null; },
        async getCompany(tenant, company) { return tenant === "tenant-test" && ["company-a", "company-b"].includes(company) ? { status: controls.activeCompany ? "active" : "inactive", unitIds: [company === "company-a" ? "unit-a" : "unit-b"] } : null; },
        async getBinding(tenantId, userId) { return draft.bindings.find((row) => row.tenantId === tenantId && row.userId === userId) ?? null; },
        async saveClientMembership(tenantId, userId) { if (!draft.memberships.some((row) => row.tenantId === tenantId && row.userId === userId)) draft.memberships.push({ tenantId, userId, role: "cliente", status: "active" }); },
        async saveBinding(binding) { draft.bindings = draft.bindings.filter((row) => row.userId !== binding.userId || row.tenantId !== binding.tenantId); draft.bindings.push(structuredClone(binding)); },
        async appendEvent(event) { if (controls.failAudit) throw new Error("Falha sintética de auditoria"); draft.events.push(structuredClone(event)); },
      };
      const result = await run(tx);
      Object.assign(state, draft);
      return result;
    },
  };
  return { state, controls, adapter };
}
const command = (userId = "client-a", companyId = "company-a", unitId = "unit-a") => ({ operation: "grant" as "grant" | "revoke", userId, companyId, unitIds: [unitId], validUntil: "2099-01-01T00:00:00Z", expectedRevision: 0, reviewReference: "Revisão humana fictícia" });

test("provisiona duas identidades independentes com papel cliente e escopos separados", async () => {
  const { state, adapter } = fixture();
  await provisionClientCompanyCandidate(adapter, command());
  await provisionClientCompanyCandidate(adapter, command("client-b", "company-b", "unit-b"));
  assert.equal(state.bindings.length, 2);
  assert.deepEqual(state.memberships.map((row) => row.role), ["cliente", "cliente"]);
  for (const binding of state.bindings) {
    const access = { tenant: { id: "tenant-test" }, membership: { role: "cliente" }, companyScope: binding };
    for (const other of state.bindings) assert.equal(canAccessCompanyResource(access, { ...other, unitId: other.unitIds[0] }), binding.userId === other.userId);
    assert.equal(canAccessCompanyResource(access, { tenantId: "other-tenant", companyId: binding.companyId, unitId: binding.unitIds[0] }), false);
  }
  assert.equal(state.events.length, 2);
});

test("nega falta de sessão/autoridade, identidade não verificada, Master e autoatribuição", async () => {
  for (const alteration of [
    (f: ReturnType<typeof fixture>) => { f.controls.actor = null; },
    (f: ReturnType<typeof fixture>) => { f.controls.authorized = false; },
    (f: ReturnType<typeof fixture>) => { f.controls.verified = false; },
    (f: ReturnType<typeof fixture>) => { f.controls.master = true; },
    (f: ReturnType<typeof fixture>) => { f.controls.actor = { userId: "client-a", tenantId: "tenant-test" }; },
  ]) {
    const f = fixture(); alteration(f);
    await assert.rejects(provisionClientCompanyCandidate(f.adapter, command()));
    assert.deepEqual(f.state, { bindings: [], events: [], memberships: [] });
  }
});

test("nega empresa inativa, unidades externas, duplicadas, validade e revisão inválidas", async () => {
  const invalid = [
    { companyId: "company-outside" }, { unitIds: ["unit-b"] }, { unitIds: [] }, { unitIds: ["unit-a", "unit-a"] },
    { validUntil: "2020-01-01" }, { validUntil: "inválido" }, { expectedRevision: 1 }, { reviewReference: " " },
  ];
  for (const input of invalid) {
    const f = fixture();
    await assert.rejects(provisionClientCompanyCandidate(f.adapter, { ...command(), ...input }));
    assert.equal(f.state.bindings.length, 0);
  }
  const f = fixture(); f.controls.activeCompany = false;
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, command()));
});

test("não converte administrador ou reativa membership suspensa", async () => {
  for (const [role, status] of [["consultoria_admin", "active"], ["cliente", "suspended"]]) {
    const f = fixture();
    f.state.memberships.push({ tenantId: "tenant-test", userId: "client-a", role, status });
    await assert.rejects(provisionClientCompanyCandidate(f.adapter, command()));
    assert.equal(f.state.bindings.length, 0);
    assert.equal(f.state.memberships[0].role, role);
    assert.equal(f.state.memberships[0].status, status);
  }
});

test("falha de auditoria desfaz membership e vínculo na transação candidata", async () => {
  const f = fixture(); f.controls.failAudit = true;
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, command()), /Falha sintética/);
  assert.deepEqual(f.state, { bindings: [], events: [], memberships: [] });
});

test("revogação preserva histórico e exige revisão atual e autoridade vigente", async () => {
  const f = fixture();
  await provisionClientCompanyCandidate(f.adapter, command());
  const revoke = { ...command(), operation: "revoke" as const, expectedRevision: 1 };
  f.controls.authorized = false;
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, revoke));
  f.controls.authorized = true;
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, { ...revoke, expectedRevision: 0 }));
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, { ...revoke, companyId: "company-b" }));
  const result = await provisionClientCompanyCandidate(f.adapter, revoke);
  assert.equal(result.status, "revoked");
  assert.equal(result.revision, 2);
  assert.deepEqual(f.state.events.map((row) => row.binding.status), ["active", "revoked"]);
  assert.equal(f.state.events[0].binding.revision, 1);
  assert.equal(f.state.bindings[0].status, "revoked");
  await assert.rejects(provisionClientCompanyCandidate(f.adapter, { ...revoke, expectedRevision: 2 }));
});
