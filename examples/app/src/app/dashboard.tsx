"use client";

import { getSafetyAuditActionLabel } from "@/lib/safety-audit-labels";
import type { WorkPermitAuditEntry } from "@/lib/work-permit-audit-targets";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "./actions";
import ClientSection from "./client-section";
import WorkerSection from "./worker-section";
import DocumentSection from "./document-section";
import type { ClientCompany } from "@/lib/client-store";
import type { WorkerRecord } from "@/lib/worker-store";
import type { DocumentGroup } from "@/lib/document-store";
import type { ComplianceRule, ComplianceEvaluation } from "@/lib/compliance-store";
import type { PgrDraft } from "@/lib/pgr-store";
import type { PgrStorageMode } from "@/lib/pgr-storage-mode";
import type { PgrInventoryRecord, PgrRiskOptionSet } from "@/lib/pgr-postgres-operations";
import { WORK_PERMIT_PTE_TYPES, WORK_PERMIT_TYPES } from "@/lib/work-permit-readiness";
import OperationsSection from "./operations-section";
import type { OperationsOverview } from "@/lib/operations-store";
import EpiSection from "./epi-section";
import type { EpiDelivery, EpiWorker } from "@/lib/epi-store";
import ThirdPartySection from "./third-party-section";
import IssueSection, { type IssueReviewer } from "./issue-section";
import type { InvitationSummary, ThirdPartyDocumentSource } from "@/lib/third-party-store";
import type { ThirdPartyGateOverview } from "@/lib/third-party-gate-read-store";
import type { ClientRegistrarInvitationProposal } from "@/lib/third-party-legacy-invitation-read-service";
import AsoSection from "./aso-section";
import type { AsoRecord, AsoSummary, AsoWorker } from "@/lib/aso-store";
import PcmsoSection from "./pcmso-section";
import type { PcmsoRecord, PcmsoSummary } from "@/lib/pcmso-store";
import PgrSection from "./pgr-section";
import ClientCaseConfirmationsSection from "./client-case-confirmations-section";
import SafetyOperationsSection from "./safety-operations-section";
import RiskAnalysisSection from "./risk-analysis-section";
import type { SafetyApr, SafetyChecklistTemplate } from "@/lib/safety-operations-store";
import type { RiskAnalysis } from "@/lib/risk-analysis-store";

type DashboardUser = { email: string; name: string; roleLabel: string };
type DashboardTenant = { id: string; name: string };
type DashboardAuditEvent = WorkPermitAuditEntry;

const navigation = [
  { id: "inicio", label: "Início", icon: "home" },
  { id: "analise-risco", label: "AR · Análise de risco", icon: "clipboard" },
  { id: "empresas", label: "Empresas", icon: "building" },
  { id: "pgr", label: "PGR", icon: "clipboard" },
  { id: "documentos", label: "Documentos", icon: "file" },
  { id: "pcmso", label: "PCMSO", icon: "file" },
  { id: "aso", label: "ASO", icon: "file" },
  { id: "terceiros", label: "Terceiros", icon: "people" },
  { id: "confirmacoes", label: "Confirmações", icon: "check" },
  { id: "epi", label: "EPI", icon: "check" },
  { id: "pendencias", label: "Pendências", icon: "check" },
  { id: "auditoria", label: "Auditoria", icon: "history" },
  { id: "trabalhadores", label: "Trabalhadores", icon: "people" },
  { id: "dds", label: "DDS", icon: "clipboard" },
  { id: "checklists", label: "Checklists", icon: "check" },
  { id: "desvios", label: "Desvios de SST", icon: "warning" },
] as const;
type SectionId = (typeof navigation)[number]["id"];

const sectionCopy: Record<SectionId, { title: string; description: string; empty: string }> = {
  terceiros: { title: "Terceiros", description: "Solicite documentos existentes de empresas contratadas e acompanhe o recebimento.", empty: "Crie um convite fictício de envio." },
  confirmacoes: { title: "Confirmações de vínculos", description: "Revise propostas de vínculo com convites legados no escopo de representante designado.", empty: "Nenhuma proposta disponível para um escopo de representante válido." },
  aso: { title: "ASO, exames e aptidão", description: "Acompanhe registros fictícios com acesso restrito e revisão médica.", empty: "Cadastre trabalhadores e vincule o médico à unidade." },
  pcmso: { title: "PCMSO", description: "Acompanhe a elaboração documental sob responsabilidade médica.", empty: "Vincule um coordenador médico fictício para iniciar." },
  inicio: { title: "Painel operacional", description: "Acompanhe prioridades, prazos internos e avisos da sua consultoria.", empty: "Quando você cadastrar uma empresa, o resumo da operação vai aparecer aqui." },
  "analise-risco": { title: "AR · Análise de Risco", description: "Registre análise independente de APR/PGR, sob responsabilidade do profissional SST.", empty: "Nenhuma análise de risco foi registrada para esta consultoria." },
  empresas: { title: "Empresas", description: "Organize as empresas e unidades atendidas pela sua consultoria.", empty: "Cadastre empresas, CNPJs e unidades em um só lugar." },
  pgr: { title: "PGR", description: "Organize inventários de riscos e acompanhe sua revisão técnica.", empty: "Nenhum inventário de PGR foi criado." },
  documentos: { title: "Documentos", description: "Cadastre arquivos da empresa e acompanhe versões e validade. PDFs recebidos de contratadas ficam em Terceiros; informações só compõem o PGR após avaliação técnica.", empty: "Nenhum documento cadastrado para esta consultoria." },
  epi: { title: "EPI", description: "Acompanhe entregas e confirmações fictícias de equipamentos de proteção individual.", empty: "Registre uma entrega fictícia para começar." },
  pendencias: { title: "Pendências", description: "Veja o que precisa de atenção e qual é o próximo passo.", empty: "Nenhuma pendência por enquanto. As regras e os prazos serão configurados nas próximas etapas." },
  auditoria: { title: "Auditoria", description: "Consulte os acessos registrados para esta consultoria.", empty: "Ainda não há atividades registradas." },
  trabalhadores: { title: "Trabalhadores", description: "Organize funções e informações de exposição em cada unidade.", empty: "Cadastre os vínculos de demonstração com as empresas atendidas." },
  dds: { title: "DDS", description: "Registre o diálogo diário de segurança com foto, tema e assinaturas.", empty: "Abra a área de DDS pelo menu." },
  desvios: { title: "Desvios de SST", description: "Relate desvios e quase incidentes. Qualquer pessoa da equipe pode registrar.", empty: "Abra a área de desvios pelo menu." },
  checklists: { title: "Checklists", description: "Aplique checklists de áreas e equipamentos criados pela equipe SST.", empty: "Abra a área de checklists pelo menu." },
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "home") return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></svg>;
  if (name === "building") return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/></svg>;
  if (name === "file") return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>;
  if (name === "warning") return <svg {...common}><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>;
  if (name === "clipboard") return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6m-6 4h6m-6 4h3"/></svg>;
  if (name === "permit") return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6m-12 5h8m-8 4h5"/><path d="m15 17 1.5 1.5L20 15"/></svg>;
  if (name === "equipment") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/><path d="m6 7 1 1 2-2m-3 6 1 1 2-2m-3 6 1 1 2-2"/></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  if (name === "people") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "history") return <svg {...common}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>;
}

function NavButton({ id, label, icon, active }: { id: SectionId; label: string; icon: string; active: boolean }) {
  const href = id === "empresas" ? "/empresas" : id === "trabalhadores" ? "/trabalhadores" : id === "documentos" ? "/documentos" : id === "dds" ? "/dds" : id === "checklists" ? "/checklists" : id === "desvios" ? "/desvios" : `/?section=${id}`;
  // A navegação deve funcionar mesmo antes de o JavaScript do painel carregar.
  return <a className={`nav-link${active ? " nav-link-active" : ""}`} href={href} aria-current={active ? "page" : undefined}><Icon name={icon}/><span>{label}</span></a>;
}

function SafetyModules({ canOpenApr }: { canOpenApr: boolean }) {
  type WorkPermitDisplayType = { label: string; status: string; note?: string };
  const modules: { title: string; description: string; icon: string; tone: string; origin?: string; note?: string; types?: readonly WorkPermitDisplayType[]; href?: string }[] = [
    { title: "APR", description: "Análise preliminar de riscos", icon: "warning", tone: "risk", href: "#safety-apr" },
    { title: "PTE", description: "Permissão para Entrada e Trabalho em Espaço Confinado · NR-33", icon: "permit", tone: "special", types: WORK_PERMIT_PTE_TYPES },
    { title: "PT", description: "Permissão discriminada por atividade", icon: "clipboard", tone: "permit", origin: "Origem prevista: PGR e APR", note: "A relação entre cada tipo de PT, os riscos do PGR e as medidas de controle ainda depende de definição e validação humana. Nenhuma PT é liberada nesta etapa.", types: WORK_PERMIT_TYPES },
    { title: "Checklist de equipamentos", description: "Nomes dos equipamentos e parâmetros serão definidos depois", icon: "equipment", tone: "equipment" },
  ];

  return <section className="safety-modules" aria-labelledby="safety-modules-title">
    <div className="safety-modules-heading"><div><h2 id="safety-modules-title">Segurança operacional</h2><p>APR e checklist configurável estão disponíveis para a equipe autorizada; PT, PTE e demais listas seguem planejadas.</p></div></div>
    <div className="safety-module-grid">{modules.map((module) => <article className={`safety-module${module.types ? " safety-module-catalog" : ""}`} key={module.title}>
      <span className={`safety-module-icon ${module.tone}`}><Icon name={module.icon} size={23}/></span>
      <div className="safety-module-copy"><h3>{module.title}</h3><p>{module.description}</p>{module.origin && <p className="safety-module-origin">{module.origin}</p>}{!module.types && <span className="safety-module-status">{module.href && canOpenApr ? "Disponível" : "Planejado"}</span>}</div>
      {module.href && canOpenApr && <a className="text-action" href={module.href}>Configurar e abrir APR →</a>}
      {module.types && <ul className="safety-module-types">{module.types.map((type) => <li key={type.label}><strong>{type.label}</strong><span className="safety-module-type-status">{type.status}</span>{"note" in type && <span className="safety-module-type-note">{type.note}</span>}</li>)}</ul>}
      {module.note && <p className="safety-module-note">{module.note}</p>}
    </article>)}</div>
  </section>;
}

export default function Home({
  operations, canManageOperations, epiDeliveries, epiWorkers, canManageEpi,
  issueReviewers, currentUserId, thirdPartyInvitations, thirdPartyGate, canManageThirdParty,
  clientRegistrarProposals = [],
  asoRecords, asoSummaries, asoWorkers, pcmsoRecords, pcmsoSummaries, pcmsoCoordinators,
  canAssignPcmso, isMedical, pcmsoStorageMode, pcmsoPgrRiskOptions = [], pcmsoPgrRiskError,
  user, tenant, auditEvents, visibleSections, clients, canManageClients, workers, canManageWorkers,
  documents, thirdPartyDocuments, canManageDocuments, canReviewDocuments, complianceRules,
  complianceEvaluations, pgrDrafts, pgrStorageMode, pgrPostgresRecords, pgrPostgresError,
  dataLoadWarnings = [], canManagePgr, currentDate, safetyAprs, safetyChecklistTemplates, riskAnalyses,
}: {
  operations: OperationsOverview | null;
  canManageOperations: boolean;
  epiDeliveries: EpiDelivery[];
  epiWorkers: EpiWorker[];
  canManageEpi: boolean;
  issueReviewers: IssueReviewer[];
  currentUserId: string;
  thirdPartyInvitations: InvitationSummary[];
  thirdPartyGate: ThirdPartyGateOverview | null;
  canManageThirdParty: boolean;
  clientRegistrarProposals?: ClientRegistrarInvitationProposal[];
  asoRecords: AsoRecord[];
  asoSummaries: AsoSummary[];
  asoWorkers: AsoWorker[];
  pcmsoRecords: PcmsoRecord[];
  pcmsoSummaries: PcmsoSummary[];
  pcmsoCoordinators: { userId: string; displayName: string }[];
  canAssignPcmso: boolean;
  isMedical: boolean;
  pcmsoStorageMode: "json" | "postgres";
  pcmsoPgrRiskOptions?: PgrRiskOptionSet[];
  pcmsoPgrRiskError?: string;
  user: DashboardUser;
  tenant: DashboardTenant;
  auditEvents: DashboardAuditEvent[];
  visibleSections: string[];
  clients: ClientCompany[];
  canManageClients: boolean;
  workers: WorkerRecord[];
  canManageWorkers: boolean;
  documents: DocumentGroup[];
  thirdPartyDocuments: ThirdPartyDocumentSource[];
  canManageDocuments: boolean;
  canReviewDocuments: boolean;
  complianceRules: ComplianceRule[];
  complianceEvaluations: ComplianceEvaluation[];
  pgrDrafts: PgrDraft[];
  pgrStorageMode: PgrStorageMode;
  pgrPostgresRecords: PgrInventoryRecord[];
  pgrPostgresError?: string;
  dataLoadWarnings?: string[];
  canManagePgr: boolean;
  safetyAprs: SafetyApr[];
  safetyChecklistTemplates: SafetyChecklistTemplate[];
  riskAnalyses: RiskAnalysis[];
  currentDate: string;
}) {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const initialSection = navigation.find((item) => item.id === requestedSection && visibleSections.includes(item.id))?.id;
  const [section, setSection] = useState<SectionId>(initialSection ?? (isMedical ? "pcmso" : "inicio"));
  const content = sectionCopy[section];
  const activeLabel = navigation.find((item) => item.id === section)?.label;
  const allowedNavigation = navigation.filter((item) => visibleSections.includes(item.id));

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Menu principal">
      <button className="brand" onClick={() => setSection("inicio")} aria-label="SST Hoje, voltar ao início"><Image className="brand-image" src="/logo-sst-hoje.png" alt="" width={72} height={72} priority/><span className="brand-name">SST <strong>Hoje</strong><small>Não deixa para amanhã.</small></span></button>
      <div className="workspace-label" title={tenant.name}>{tenant.name.toUpperCase()}</div>
      <nav className="navigation">{allowedNavigation.map((item) => <NavButton key={item.id} {...item} active={section === item.id}/>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><span className="help-icon"><Icon name="spark" size={18}/></span><strong>Estamos construindo</strong><p>Esta é a primeira etapa do SST Hoje. Novas funções chegam aos poucos.</p></div>
        <div className="profile-row"><span className="avatar" aria-hidden="true">S</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.roleLabel} · demo</small></span><span className="online-dot" aria-label="Sessão ativa"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><Image src="/logo-sst-hoje.png" alt="" width={38} height={38} priority/><span>SST <strong>Hoje</strong></span></div><div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>{activeLabel}</strong></div><div className="topbar-right"><span className="signed-in-email">{user.email}</span><span className="demo-badge"><span/> Versão inicial</span><form action={logoutAction}><button className="logout-button" type="submit">Sair <span aria-hidden="true">↗</span></button></form></div></header>
      <div className={`content-wrap${section === "confirmacoes" ? " content-wrap-confirmacoes" : ""}`}>
        <section className="welcome-row" aria-labelledby="page-title"><div><p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p><h1 id="page-title">{content.title}</h1><p className="page-description">{content.description}</p></div><div className="welcome-mark" aria-hidden="true"><Icon name="spark" size={26}/></div></section>
        {dataLoadWarnings.length > 0 && <p className="client-form-message client-form-error" role="alert">Algumas informações estão temporariamente indisponíveis: {dataLoadWarnings.join(" ")} As demais áreas continuam disponíveis.</p>}
        {section === "confirmacoes" && <ClientCaseConfirmationsSection proposals={clientRegistrarProposals}/>}

        {section === "analise-risco" && <RiskAnalysisSection records={riskAnalyses} companies={clients} canManage/>}
        {section === "analise-risco" ? null : section === "inicio" ? operations ? <OperationsSection overview={operations} canManage={canManageOperations} companyCount={clients.filter(c => c.status === "active").length} workerCount={workers.filter(w => w.status === "active").length} onOpen={setSection}/> : <section className="panel pgr-section"><h2>Seu painel de demonstração</h2><p>Use o menu para acessar as áreas autorizadas para seu perfil.</p></section> : section === "epi" ? <EpiSection deliveries={epiDeliveries} workers={epiWorkers} canManage={canManageEpi} currentDate={currentDate}/> : section === "pendencias" ? <IssueSection invitations={thirdPartyInvitations} reviewers={issueReviewers} currentUserId={currentUserId} evaluations={complianceEvaluations} onOpenDocuments={() => setSection("documentos")} onOpenThirdParty={() => setSection("terceiros")}/> : section === "terceiros" ? <ThirdPartySection invitations={thirdPartyInvitations} companies={clients} canManage={canManageThirdParty} canReview={canReviewDocuments} gate={thirdPartyGate}/> : section === "aso" ? <AsoSection records={asoRecords} summaries={asoSummaries} workers={asoWorkers} isMedical={isMedical} onOpenPcmso={() => setSection("pcmso")} onOpenWorkers={visibleSections.includes("trabalhadores") ? () => setSection("trabalhadores") : undefined}/> : section === "pcmso" ? <PcmsoSection records={pcmsoRecords} summaries={pcmsoSummaries} coordinators={pcmsoCoordinators} canAssign={canAssignPcmso} isMedical={isMedical} pcmsoStorageMode={pcmsoStorageMode} companies={clients} pgrRiskOptions={pcmsoPgrRiskOptions} pgrRiskError={pcmsoPgrRiskError}/> : section === "empresas" ? <ClientSection companies={clients} canManage={canManageClients}/> : section === "trabalhadores" ? <WorkerSection workers={workers} companies={clients} canManage={canManageWorkers} onOpenCompanies={() => setSection("empresas")}/> : section === "pgr" ? <PgrSection records={pgrDrafts} companies={clients} canManage={canManagePgr} canReview={canReviewDocuments} storageMode={pgrStorageMode} postgresRecords={pgrPostgresRecords} postgresError={pgrPostgresError}/> : section === "documentos" ? <DocumentSection documents={documents} thirdPartyDocuments={thirdPartyDocuments} companies={clients} canManage={canManageDocuments} canReview={canReviewDocuments} rules={complianceRules} evaluations={complianceEvaluations} currentDate={currentDate} onOpenCompanies={() => setSection("empresas")}/> : section === "auditoria" ? <section className="panel audit-panel"><div className="panel-heading"><div><h2>Atividade de {tenant.name}</h2><p>Este histórico é visível somente para perfis autorizados nesta consultoria.</p></div><span className="period-label">Últimos 100 eventos</span></div>{auditEvents.length ? <ol className="audit-list">{auditEvents.map((event) => <li className="audit-event" key={event.id}><span className="audit-event-icon"><Icon name="history" size={16}/></span><span className="audit-event-copy"><strong>{event.action.startsWith("operations.") ? ({ "operations.deadline_set": "Prazo interno registrado", "operations.preferences_set": "Preferências de avisos atualizadas", "operations.notice_created": "Aviso local gerado", "operations.notice_read": "Aviso local marcado como lido" }[event.action] ?? "Atividade operacional") : event.action.startsWith("epi.") ? ({ "epi.created": "Entrega fictícia de EPI registrada", "epi.read": "Entrega de EPI consultada", "epi.link_renewed": "Link local de EPI renovado", "epi.code_issued": "Código mock de EPI gerado", "epi.code_failed": "Tentativa de código incorreto", "epi.confirmed": "Simulação de recebimento confirmada", "epi.canceled": "Entrega fictícia cancelada", "epi.receipt_read": "Comprovante fictício de EPI consultado" }[event.action] ?? "Atividade de EPI") : event.action.startsWith("thirdparty.") ? ({ "thirdparty.issue_opened": "Pendência de terceiro aberta", "thirdparty.issue_updated": "Pendência ou link atualizado", "thirdparty.issue_reviewed": "Reavaliação interna registrada", "thirdparty.created": "Convite de terceiro criado", "thirdparty.revoked": "Link local de terceiro renovado", "thirdparty.code_issued": "Código mock de terceiro gerado", "thirdparty.code_failed": "Tentativa de código incorreto", "thirdparty.confirmed": "Simulação de recebimento confirmada", "thirdparty.canceled": "Entrega fictícia cancelada", "thirdparty.receipt_read": "Comprovante fictício de documento consultado", "thirdparty.downloaded": "PDF de terceiro baixado" }[event.action] ?? "Atividade de terceiro") : event.action.startsWith("aso.") ? ({ "aso.read": "ASO consultado pelo médico", "aso.status_read": "Andamento do ASO consultado", "aso.workers_read": "Cadastro mínimo consultado pelo médico", "aso.saved": "Versão de ASO salva", "aso.submitted": "ASO enviado para revisão", "aso.reviewed": "Revisão interna de ASO registrada" }[event.action] ?? "Atividade de ASO") : event.action.startsWith("pcmso.") ? ({ "pcmso.read": "PCMSO consultado pelo coordenador", "pcmso.status_read": "Andamento do PCMSO consultado", "pcmso.assigned": "Coordenador médico vinculado", "pcmso.saved": "Versão de PCMSO salva", "pcmso.submitted": "PCMSO enviado para revisão", "pcmso.reviewed": "Revisão interna de PCMSO registrada" }[event.action] ?? "Atividade de PCMSO") : event.action === "auth.login_succeeded" ? "Sessão iniciada" : event.action === "auth.logout" ? "Sessão encerrada" : event.action === "client.created" ? "Empresa cadastrada" : event.action === "client.status_changed" ? "Situação da empresa alterada" : event.action === "worker.created" ? "Trabalhador cadastrado" : event.action === "worker.updated" ? "Dados do trabalhador alterados" : event.action === "worker.status_changed" ? "Situação do trabalhador alterada" : event.action === "document.uploaded" ? "Documento enviado" : event.action === "document.replaced" ? "Documento substituído" : event.action === "document.archived" ? "Documento arquivado" : event.action === "compliance.rule_created" ? "Critério de avaliação cadastrado" : event.action === "pgr.created" ? "Rascunho de PGR criado" : event.action === "pgr.updated" ? "Rascunho de PGR atualizado" : event.action === "pgr.submitted" ? "PGR enviado para revisão" : event.action === "pgr.approved" ? "Revisão interna de PGR registrada" : (getSafetyAuditActionLabel(event.action) ?? "Avaliação de documento registrada")}</strong>{event.workPermitDraft ? <a href={event.workPermitDraft.href}>Abrir versão atual · {event.workPermitDraft.title}</a> : null}<small>{event.actorRole === "consultoria_admin" ? "Administradora" : event.actorRole} · conta fictícia</small></span><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.occurredAt))}</time></li>)}</ol> : <div className="audit-empty"><div className="empty-art"><span className="empty-art-circle"><Icon name="history" size={24}/></span></div><h3>{content.empty}</h3><p>Entradas e saídas de conta aparecem aqui. Senhas e tokens não são registrados.</p></div>}</section> : <section className="panel section-empty-panel"><div className="empty-state"><div className="empty-art"><span className="empty-art-circle"><Icon name={navigation.find((item) => item.id === section)?.icon ?? "info"} size={25}/></span></div><h2>Esta área está sendo preparada</h2><p>{content.empty}</p><button className="text-action" onClick={() => setSection("inicio")}>Voltar ao início <Icon name="arrow" size={16}/></button></div></section>}
        {section === "inicio" && <SafetyModules canOpenApr={canManagePgr}/>}
        {section === "inicio" && canManagePgr && <SafetyOperationsSection templates={safetyChecklistTemplates} aprs={safetyAprs} companies={clients} inventories={pgrPostgresRecords} canManage={canManagePgr} pgrError={pgrPostgresError}/>}
        <footer className="page-footer"><span>SST Hoje</span><span>Uma etapa de cada vez.</span><span>v0.1 · demonstração</span></footer>
      </div>
    </main>
    <nav className="mobile-nav" aria-label="Navegação principal">{allowedNavigation.map((item) => <NavButton key={item.id} {...item} active={section === item.id}/>)}</nav>
  </div>;
}
