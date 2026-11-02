import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { DEMO_MEMBERSHIPS, getVisibleSections, hasTenantPermission, requireTenantAccess } from "@/lib/tenant-access";
import { listAuditEventsForTenant } from "@/lib/audit-log";
import { listClientCompaniesForTenant } from "@/lib/client-store";
import { listWorkersForTenant } from "@/lib/worker-store";
import { listDocumentGroupsForTenant } from "@/lib/document-store";
import { listComplianceEvaluationsForTenant, listComplianceRulesForTenant } from "@/lib/compliance-store";
import { listPgrDraftsForTenant } from "@/lib/pgr-store";
import { listAssignedPcmso, listPcmsoSummaries } from "@/lib/pcmso-service";
import { listAsoSummaries, listAsoWorkers, listMedicalAsos } from "@/lib/aso-service";
import { listThirdPartyInvitations } from "@/lib/third-party-service";
import { listEpiDeliveries, listEpiWorkers } from "@/lib/epi-service";
import { getOperationsOverview } from "@/lib/operations-service";
import { isPlatformMaster } from "@/lib/platform-identity";
import Dashboard from "./dashboard";

export default function HomePage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo seu painel…</main>}><AuthenticatedHome /></Suspense>;
}

async function AuthenticatedHome() {
  await connection();
  const access = await getCurrentTenantAccess("tenant.dashboard.read");
  if (!access.authenticated) redirect("/login");
  if (isPlatformMaster(access.session.userId)) redirect("/master");
  if (!access.context) redirect("/sem-acesso");

  const { membership, tenant } = access.context;
  const currentDate = new Date().toISOString().slice(0, 10);
  const canReadAudit = hasTenantPermission(membership.role, "tenant.audit.read");
  const auditEvents = canReadAudit ? listAuditEventsForTenant(tenant.id) : [];
  const canReadClients = hasTenantPermission(membership.role, "tenant.clients.read");
  const clients = canReadClients ? listClientCompaniesForTenant(tenant.id) : [];
  const canManageClients = hasTenantPermission(membership.role, "tenant.clients.manage");
  const canReadWorkers = hasTenantPermission(membership.role, "workers.read");
  const workers = canReadWorkers ? listWorkersForTenant(tenant.id) : [];
  const canManageWorkers = hasTenantPermission(membership.role, "workers.manage");
  const canReadDocuments = hasTenantPermission(membership.role, "documents.read");
  const documents = canReadDocuments ? listDocumentGroupsForTenant(tenant.id) : [];
  const canManageDocuments = hasTenantPermission(membership.role, "documents.manage");
  const canReviewDocuments = hasTenantPermission(membership.role, "documents.review");
  const canManagePgr = hasTenantPermission(membership.role, "pgr.manage");
  const complianceRules = canReviewDocuments ? listComplianceRulesForTenant(tenant.id) : [];
  const complianceEvaluations = canReviewDocuments ? listComplianceEvaluationsForTenant(tenant.id) : [];
  const pgrDrafts = hasTenantPermission(membership.role, "documents.read") ? listPgrDraftsForTenant(tenant.id) : [];
  const isMedical = hasTenantPermission(membership.role, "pcmso.manage");
  const pcmsoRecords = isMedical ? await listAssignedPcmso(access.session.userId) : [];
  const pcmsoSummaries = hasTenantPermission(membership.role, "pcmso.status.read") ? await listPcmsoSummaries(access.session.userId) : [];
  const canAssignPcmso = hasTenantPermission(membership.role, "pcmso.assign");
  const pcmsoCoordinators = canAssignPcmso ? DEMO_MEMBERSHIPS.filter(m => m.tenantId === tenant.id && m.role === "medico_coordenador" && m.status === "active").map(m => ({ userId: m.userId, displayName: m.displayName })) : [];
  const asoRecords = isMedical ? await listMedicalAsos(access.session.userId) : [];
  const asoWorkers = isMedical ? await listAsoWorkers(access.session.userId) : [];
  const asoSummaries = hasTenantPermission(membership.role, "aso.status.read") ? await listAsoSummaries(access.session.userId) : [];
  const thirdPartyInvitations = hasTenantPermission(membership.role, "thirdparty.read") ? listThirdPartyInvitations(access.session.userId) : [];
  const canManageThirdParty = requireTenantAccess(access.session.userId, "thirdparty.manage").ok;
  const issueReviewers = canReviewDocuments ? DEMO_MEMBERSHIPS.filter(m => m.tenantId === tenant.id && m.status === "active" && hasTenantPermission(m.role, "documents.review") && hasTenantPermission(m.role, "thirdparty.read")).map(m => ({ userId: m.userId, displayName: m.displayName })) : [];
  const canManageEpi = requireTenantAccess(access.session.userId, "epi.manage").ok;
  const epiDeliveries = hasTenantPermission(membership.role, "epi.read") ? listEpiDeliveries(access.session.userId) : [];
  const epiWorkers = canManageEpi ? listEpiWorkers(access.session.userId) : [];
  const operations = hasTenantPermission(membership.role, "operations.read") ? getOperationsOverview(access.session.userId) : null;
  const canManageOperations = requireTenantAccess(access.session.userId, "operations.manage").ok;
  const visibleSections = getVisibleSections(membership.role);
  const roleLabels = {
    consultoria_admin: "Administradora da consultoria",
    sst_tst: "Profissional SST",
    cliente: "Cliente",
    terceiro: "Terceiro",
    medico_coordenador: "Coordenador médico fictício",
    profissional_habilitado: "Profissional habilitado",
    saas_master: "SaaS Master",
  } as const;

  return <Dashboard
    operations={operations} canManageOperations={canManageOperations}
    epiDeliveries={epiDeliveries} epiWorkers={epiWorkers} canManageEpi={canManageEpi}
    issueReviewers={issueReviewers} currentUserId={access.session.userId}
    thirdPartyInvitations={thirdPartyInvitations} canManageThirdParty={canManageThirdParty}
    asoRecords={asoRecords} asoWorkers={asoWorkers} asoSummaries={asoSummaries}
    pcmsoRecords={pcmsoRecords} pcmsoSummaries={pcmsoSummaries} pcmsoCoordinators={pcmsoCoordinators} canAssignPcmso={canAssignPcmso} isMedical={isMedical}
    user={{ email: access.session.email, name: membership.displayName, roleLabel: roleLabels[membership.role] }}
    tenant={tenant}
    auditEvents={auditEvents}
    clients={clients}
    canManageClients={canManageClients}
    workers={workers}
    canManageWorkers={canManageWorkers}
    documents={documents}
    canManageDocuments={canManageDocuments}
    currentDate={currentDate}
    canReviewDocuments={canReviewDocuments}
    complianceRules={complianceRules}
    complianceEvaluations={complianceEvaluations}
    pgrDrafts={pgrDrafts}
    canManagePgr={canManagePgr}
    visibleSections={visibleSections}
  />;
}
