import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { DEMO_MEMBERSHIPS, getVisibleSections, hasTenantPermission, requireTenantAccess } from "@/lib/tenant-access";
import { listAuditEventsForTenant } from "@/lib/audit-log";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";
import { listDocumentGroupsForTenant } from "@/lib/document-store";
import { listComplianceEvaluationsForTenant, listComplianceRulesForTenant } from "@/lib/compliance-store";
import { listPgrDraftsForTenant } from "@/lib/pgr-store";
import { getPgrStorageMode } from "@/lib/pgr-storage-mode";
import { listPgrAuditEventsPostgres, listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import type { PgrInventoryRecord, PgrRiskOptionSet } from "@/lib/pgr-postgres-operations";
import { listAssignedMedicalPgrRiskOptionsPostgres } from "@/lib/pgr-postgres-store";
import { listAssignedPcmso, listPcmsoSummaries } from "@/lib/pcmso-service";
import { getPcmsoStorageMode } from "@/lib/pcmso-storage-mode";
import { listAsoSummaries, listAsoWorkers, listMedicalAsos } from "@/lib/aso-service";
import { listThirdPartyInvitations } from "@/lib/third-party-service";
import { listEpiDeliveries, listEpiWorkers } from "@/lib/epi-service";
import { getOperationsOverview } from "@/lib/operations-service";
import { isPlatformMaster } from "@/lib/platform-identity";
import { listSafetyAprs, listSafetyChecklistTemplates } from "@/lib/safety-operations-store";
import { listRiskAnalyses } from "@/lib/risk-analysis-store";
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
  const dataLoadWarnings: string[] = [];
  const currentDate = new Date().toISOString().slice(0, 10);
  const pgrStorageMode = getPgrStorageMode();
  const canReadAudit = hasTenantPermission(membership.role, "tenant.audit.read");
  const auditEvents = canReadAudit ? listAuditEventsForTenant(tenant.id) : [];
  const canReadClients = hasTenantPermission(membership.role, "tenant.clients.read");
  const clients = canReadClients ? await listClientCompanies(tenant.id) : [];
  const canManageClients = hasTenantPermission(membership.role, "tenant.clients.manage");
  const canReadWorkers = hasTenantPermission(membership.role, "workers.read");
  const workers = canReadWorkers ? listWorkersForTenant(tenant.id) : [];
  const canManageWorkers = hasTenantPermission(membership.role, "workers.manage");
  const canReadDocuments = hasTenantPermission(membership.role, "documents.read");
  const documents = canReadDocuments ? listDocumentGroupsForTenant(tenant.id) : [];
  const canManageDocuments = hasTenantPermission(membership.role, "documents.manage");
  const canReviewDocuments = hasTenantPermission(membership.role, "documents.review");
  const canManagePgr = hasTenantPermission(membership.role, "pgr.manage");
  const canReadSafetyApr = hasTenantPermission(membership.role, "pgr.manage");
  const safetyAprs = canReadSafetyApr ? listSafetyAprs(tenant.id) : [];
  const safetyChecklistTemplates = canReadSafetyApr ? listSafetyChecklistTemplates(tenant.id) : [];
  const canManageRiskAnalysis = hasTenantPermission(membership.role, "safety.risk_analysis.manage");
  const riskAnalyses = canManageRiskAnalysis ? listRiskAnalyses(tenant.id) : [];
  const complianceRules = canReviewDocuments ? listComplianceRulesForTenant(tenant.id) : [];
  const complianceEvaluations = canReviewDocuments ? listComplianceEvaluationsForTenant(tenant.id) : [];
  const canReadPgr = hasTenantPermission(membership.role, "documents.read");
  const pgrDrafts = canReadPgr && pgrStorageMode === "json" ? listPgrDraftsForTenant(tenant.id) : [];
  let pgrPostgresRecords: PgrInventoryRecord[] = [];
  let pgrPostgresError: string | undefined;
  if (canReadPgr && pgrStorageMode === "postgres") {
    try {
      pgrPostgresRecords = await listPgrInventoriesPostgres(tenant.id);
    } catch {
      pgrPostgresError = "Não foi possível carregar os inventários no PostgreSQL.";
    }
  }
  let visibleAuditEvents: Array<{ id: string; actorRole: string; action: string; occurredAt: string }> = auditEvents;
  if (canReadAudit && pgrStorageMode === "postgres") {
    try {
      visibleAuditEvents = [...(await listPgrAuditEventsPostgres(tenant.id)), ...auditEvents.filter((event) => !event.action.startsWith("pgr."))]
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
        .slice(0, 100);
    } catch {
      dataLoadWarnings.push("A auditoria do PGR não pôde ser consultada agora.");
    }
  }
  const isMedical = hasTenantPermission(membership.role, "pcmso.manage");
  const pcmsoRecords = isMedical ? await listAssignedPcmso(access.session.userId) : [];
  const pcmsoStorageMode = getPcmsoStorageMode();
  let pcmsoPgrRiskOptions: PgrRiskOptionSet[] = [];
  let pcmsoPgrRiskError: string | undefined;
  if (isMedical && pgrStorageMode === "postgres" && pcmsoRecords.length) {
    try {
      pcmsoPgrRiskOptions = await listAssignedMedicalPgrRiskOptionsPostgres();
    } catch {
      pcmsoPgrRiskError = "Não foi possível consultar os riscos aprovados do PGR nesta unidade.";
    }
  }
  let pcmsoSummaries: Awaited<ReturnType<typeof listPcmsoSummaries>> = [];
  if (hasTenantPermission(membership.role, "pcmso.status.read")) {
    try {
      pcmsoSummaries = await listPcmsoSummaries(access.session.userId);
    } catch {
      dataLoadWarnings.push("O resumo do PCMSO não pôde ser consultado agora.");
    }
  }
  const canAssignPcmso = hasTenantPermission(membership.role, "pcmso.assign");
  const pcmsoCoordinators = canAssignPcmso ? DEMO_MEMBERSHIPS.filter(m => m.tenantId === tenant.id && m.role === "medico_coordenador" && m.status === "active").map(m => ({ userId: m.userId, displayName: m.displayName })) : [];
  const [asoRecords, asoWorkers, asoSummaries] = await Promise.all([
    isMedical ? listMedicalAsos(access.session.userId) : [],
    isMedical ? listAsoWorkers(access.session.userId) : [],
    hasTenantPermission(membership.role, "aso.status.read") ? listAsoSummaries(access.session.userId) : [],
  ]);
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
    campo: "Líder de campo",
  } as const;

  return <Dashboard
    operations={operations} canManageOperations={canManageOperations}
    epiDeliveries={epiDeliveries} epiWorkers={epiWorkers} canManageEpi={canManageEpi}
    issueReviewers={issueReviewers} currentUserId={access.session.userId}
    thirdPartyInvitations={thirdPartyInvitations} thirdPartyGate={null} canManageThirdParty={canManageThirdParty}
    asoRecords={asoRecords} asoWorkers={asoWorkers} asoSummaries={asoSummaries}
    pcmsoRecords={pcmsoRecords} pcmsoSummaries={pcmsoSummaries} pcmsoCoordinators={pcmsoCoordinators} canAssignPcmso={canAssignPcmso} isMedical={isMedical} pcmsoStorageMode={pcmsoStorageMode} pcmsoPgrRiskOptions={pcmsoPgrRiskOptions} pcmsoPgrRiskError={pcmsoPgrRiskError}
    user={{ email: access.session.email, name: membership.displayName, roleLabel: roleLabels[membership.role] }}
    tenant={tenant}
    auditEvents={visibleAuditEvents}
    clients={clients}
    canManageClients={canManageClients}
    workers={workers}
    canManageWorkers={canManageWorkers}
    documents={documents}
    thirdPartyDocuments={canReadDocuments && hasTenantPermission(membership.role, "thirdparty.read") ? thirdPartyInvitations.map(({ companyId, unitId, companyName, unitName, relatedCnpj, contractorName, receipts }) => ({ companyId, unitId, companyName, unitName, relatedCnpj, contractorName, receipts })) : []}
    canManageDocuments={canManageDocuments}
    currentDate={currentDate}
    canReviewDocuments={canReviewDocuments}
    complianceRules={complianceRules}
    complianceEvaluations={complianceEvaluations}
    pgrDrafts={pgrDrafts}
    pgrStorageMode={pgrStorageMode}
    pgrPostgresRecords={pgrPostgresRecords}
    pgrPostgresError={pgrPostgresError}
    dataLoadWarnings={dataLoadWarnings}
    canManagePgr={canManagePgr}
    safetyAprs={safetyAprs}
    safetyChecklistTemplates={safetyChecklistTemplates}
    riskAnalyses={riskAnalyses}
    visibleSections={visibleSections}
  />;
}
