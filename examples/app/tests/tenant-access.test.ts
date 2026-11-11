import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_TENANTS, getVisibleSections, hasTenantPermission, requireTenantAccess, resolveTenantMembership } from "../src/lib/tenant-access.ts";
import { appendAuditEvent, listAuditEventsForTenant } from "../src/lib/audit-log.ts";

const originalDirectory = process.cwd();
before(() => process.chdir(mkdtempSync(join(tmpdir(), "sst-tenant-tests-"))));
after(() => process.chdir(originalDirectory));

test("a conta de demonstração recebe somente o tenant associado no servidor", () => {
  const access = requireTenantAccess("sst-demo-user", "tenant.dashboard.read");
  assert.equal(access.ok, true);
  if (access.ok) assert.equal(access.context.tenant.id, "tenant-horizonte");
});

test("trocar o tenant solicitado não concede acesso a outra consultoria", () => {
  const access = requireTenantAccess("sst-demo-user", "tenant.dashboard.read", "tenant-aurora");
  assert.deepEqual(access, { ok: false, reason: "membership_not_found" });
});

test("membro SST não recebe permissões administrativas", () => {
  const access = requireTenantAccess("sst-demo-sst", "tenant.members.manage");
  assert.deepEqual(access, { ok: false, reason: "permission_denied" });
  assert.equal(hasTenantPermission("sst_tst", "tenant.audit.read"), false);
});

test("membros com acesso ao painel podem consultar o catálogo sem gerir associações", () => {
  for (const userId of ["sst-demo-user", "sst-demo-sst", "sst-demo-medico"]) {
    assert.equal(requireTenantAccess(userId, "tenant.dashboard.read").ok, true);
  }
  assert.equal(requireTenantAccess("sst-demo-client-authority", "tenant.dashboard.read").ok, false);
  assert.equal(hasTenantPermission("cliente", "esocial.table24.manage"), false);
  assert.equal(hasTenantPermission("cliente", "esocial.table27.manage"), false);
  assert.equal(hasTenantPermission("consultoria_admin", "esocial.table24.manage"), false);
  assert.equal(hasTenantPermission("consultoria_admin", "esocial.table27.manage"), false);
});

test("as seções exibidas respeitam o papel associado ao membro", () => {
  const adminSections = getVisibleSections("consultoria_admin");
  const sstSections = getVisibleSections("sst_tst");
  assert.equal(adminSections.includes("auditoria"), true);
  assert.equal(adminSections.includes("empresas"), true);
  assert.equal(sstSections.includes("auditoria"), false);
  assert.equal(sstSections.includes("empresas"), true);
  assert.equal(hasTenantPermission("sst_tst", "tenant.clients.manage"), false);
  assert.equal(hasTenantPermission("sst_tst", "safety.risk_analysis.manage"), true);
  assert.equal(hasTenantPermission("consultoria_admin", "safety.risk_analysis.manage"), false);
  assert.equal(hasTenantPermission("sst_tst", "esocial.table24.manage"), true);
  assert.equal(hasTenantPermission("sst_tst", "esocial.table27.manage"), false);
  assert.equal(hasTenantPermission("medico_coordenador", "esocial.table24.manage"), false);
  assert.equal(hasTenantPermission("medico_coordenador", "esocial.table27.manage"), true);
  assert.equal(hasTenantPermission("consultoria_admin", "esocial.table24.manage"), false);
  assert.equal(hasTenantPermission("consultoria_admin", "esocial.table27.manage"), false);
  assert.equal(hasTenantPermission("cliente", "safety.risk_analysis.manage"), false);
  assert.equal(sstSections.includes("analise-risco"), true);
  assert.equal(adminSections.includes("analise-risco"), false);
  assert.equal(sstSections.includes("documentos"), true);
  assert.equal(adminSections.includes("pgr"), true);
  assert.equal(sstSections.includes("pgr"), true);
  assert.equal(getVisibleSections("medico_coordenador").includes("pgr"), false);
  assert.equal(getVisibleSections("terceiro").includes("pgr"), false);
  assert.equal(getVisibleSections("cliente").includes("confirmacoes"), true);
  assert.equal(getVisibleSections("consultoria_admin").includes("confirmacoes"), false);
});

test("a segunda consultoria só resolve o próprio vínculo", () => {
  const access = requireTenantAccess("sst-demo-user-b", "tenant.dashboard.read", "tenant-aurora");
  assert.equal(access.ok, true);
  if (access.ok) assert.equal(access.context.tenant.id, "tenant-aurora");
});

test("acesso desconhecido é negado por padrão", () => {
  assert.equal(resolveTenantMembership("usuario-desconhecido"), null);
  assert.equal(hasTenantPermission("role_inexistente", "tenant.dashboard.read"), false);
});

test("papel SaaS master não ganha acesso aos dados de tenant por pertencer a outra consultoria", () => {
  assert.equal(hasTenantPermission("saas_master", "saas.tenants.manage"), true);
  assert.equal(requireTenantAccess("sst-demo-user", "saas.tenants.manage").ok, false);
});

test("Master não abre dados operacionais por informar tenant e nenhuma consultoria atravessa o vínculo", () => {
  const permissions = ["tenant.clients.read", "tenant.clients.manage", "workers.read", "documents.read", "documents.review", "pgr.manage", "thirdparty.read", "epi.read", "dds.read", "checklist.read", "aso.manage", "pcmso.manage", "tenant.audit.read"];
  for (const tenantId of [undefined, "tenant-horizonte", "tenant-aurora"]) {
    for (const permission of permissions) assert.equal(requireTenantAccess("sst-demo-master", permission, tenantId).ok, false);
  }
  for (const permission of permissions) {
    assert.equal(requireTenantAccess("sst-demo-user", permission, "tenant-aurora").ok, false);
    assert.equal(requireTenantAccess("sst-demo-user-b", permission, "tenant-horizonte").ok, false);
  }
});

test("dados de tenant não aparecem na consulta de auditoria de outra consultoria", () => {
  const tenants = DEMO_TENANTS;
  appendAuditEvent({ tenantId: tenants[0].id, actorUserId: "sst-demo-user", actorRole: "consultoria_admin", action: "auth.login_succeeded" });
  appendAuditEvent({ tenantId: tenants[1].id, actorUserId: "sst-demo-user-b", actorRole: "consultoria_admin", action: "auth.login_succeeded" });

  const firstTenantEvents = listAuditEventsForTenant(tenants[0].id);
  assert.equal(firstTenantEvents.length, 1);
  assert.equal(firstTenantEvents[0].tenantId, tenants[0].id);
  assert.equal("password" in firstTenantEvents[0], false);
});

test("eventos retornados não permitem alterar a trilha armazenada", () => {
  const tenantId = DEMO_TENANTS[0].id;
  appendAuditEvent({ tenantId, actorUserId: "sst-demo-user", actorRole: "consultoria_admin", action: "auth.logout" });
  const firstRead = listAuditEventsForTenant(tenantId);
  firstRead[0].action = "auth.login_succeeded";
  const secondRead = listAuditEventsForTenant(tenantId);
  assert.equal(secondRead[0].action, "auth.logout");
});
