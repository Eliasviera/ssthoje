import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";
import { listPgrDraftsForTenant } from "@/lib/pgr-store";
import { getPgrStorageMode } from "@/lib/pgr-storage-mode";
import { listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import { listThirdPartyInvitations } from "@/lib/third-party-service";
import { listDocumentGroupsForTenant } from "@/lib/document-store";
import { listComplianceEvaluationsForTenant, listComplianceRulesForTenant } from "@/lib/compliance-store";
import { listPcmsoSummaries } from "@/lib/pcmso-service";
import ThirdPartySection from "@/app/third-party-section";
import ComplianceSection from "@/app/compliance-section";
import { readCompanyPgrDigitalization } from "@/lib/pgr-digitalization-store";
import { readPgrItemReviews } from "@/lib/pgr-item-review-store";
import PgrWorkingEditor from "@/app/pgr-working-editor";
import PgrPcmsoDraft from "@/app/pgr-pcmso-draft";
import PgrPprDraft from "@/app/pgr-ppr-draft";
import PgrPcaDraft from "@/app/pgr-pca-draft";
import PgrErgonomiaDraft from "@/app/pgr-ergonomia-draft";
import PgrLtcatDraft from "@/app/pgr-ltcat-draft";
import { readWorkingHistory } from "@/lib/pgr-working-store";
import { readContractorAnnexHistory, currentContractorAnnexes } from "@/lib/pgr-contractor-annex-store";
import PgrContractorAnnexSection from "@/app/pgr-contractor-annex-section";
import CompanyPgrImported from "@/app/company-pgr-imported";

const pgrStatus: Record<string, string> = { draft: "Rascunho", in_review: "Em revisão", approved: "Revisão interna registrada" };

export default function CompanyDetailPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ tab?: string }> }) {
  return <Suspense fallback={<main className="auth-loading">Abrindo cadastro…</main>}><CompanyDetail params={params} searchParams={searchParams}/></Suspense>;
}

async function CompanyDetail({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const access = await getCurrentTenantAccess("tenant.clients.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const [{ companyId }, query] = await Promise.all([params, searchParams]);
  const { tenant, membership } = access.context;
  const company = (await listClientCompanies(tenant.id)).find((entry) => entry.id === companyId);
  if (!company) notFound();

  const canReadWorkers = hasTenantPermission(membership.role, "workers.read");
  const canReadEpi = hasTenantPermission(membership.role,"epi.read")&&!!(await getCurrentTenantAccess("epi.read",tenant.id)).context;
  const canManageEpi = hasTenantPermission(membership.role,"epi.manage")&&!!(await getCurrentTenantAccess("epi.manage",tenant.id)).context;
  const canReadPgr = hasTenantPermission(membership.role, "documents.read");
  const canReadThirdParty = hasTenantPermission(membership.role, "thirdparty.read");
  const canManageThirdParty = hasTenantPermission(membership.role, "thirdparty.manage");
  const canReviewDocuments = hasTenantPermission(membership.role, "documents.review");
  const canReadPcmso = hasTenantPermission(membership.role, "pcmso.status.read");
  const workers = canReadWorkers ? listWorkersForTenant(tenant.id).filter((entry) => entry.companyId === company.id) : [];
  const pgrStorageMode = getPgrStorageMode();
  const drafts = canReadPgr && pgrStorageMode === "json" ? listPgrDraftsForTenant(tenant.id).filter((entry) => entry.companyId === company.id) : [];
  const inventories = canReadPgr && pgrStorageMode === "postgres" ? (await listPgrInventoriesPostgres(tenant.id)).filter((entry) => entry.inventory.companyId === company.id) : [];
  const [allThirdPartyInvitations, documentGroups, complianceRules, allEvaluations, pcmsoSummaries] = await Promise.all([
    canReadThirdParty ? listThirdPartyInvitations(access.session.userId) : Promise.resolve([]),
    canReadPgr ? listDocumentGroupsForTenant(tenant.id) : Promise.resolve([]),
    canReviewDocuments && canReadThirdParty ? listComplianceRulesForTenant(tenant.id) : Promise.resolve([]),
    canReviewDocuments && canReadThirdParty ? listComplianceEvaluationsForTenant(tenant.id) : Promise.resolve([]),
    canReadPcmso ? listPcmsoSummaries(access.session.userId) : Promise.resolve([]),
  ]);
  const thirdPartyInvitations = allThirdPartyInvitations.filter((entry) => entry.companyId === company.id);
  const companyDocuments = documentGroups.filter((entry) => entry.companyId === company.id);
  const digitalization = canReadPgr ? readCompanyPgrDigitalization(tenant.id, company.id) : null;
  const pgrWorkingHistory = digitalization && ["pgr", "pcmso"].includes(query.tab ?? "") ? readWorkingHistory(tenant.id, company.id, digitalization.sha256) : [];
  const contractorAnnexHistory = digitalization && query.tab === "pgr" ? readContractorAnnexHistory({ tenantId: tenant.id, companyId: company.id, unitId: digitalization.unitId, sha256: digitalization.sha256 }) : [];
  const companyEvaluations = allEvaluations.filter((entry) => entry.companyId === company.id);
  const companyPcmsoSummaries = pcmsoSummaries.filter((entry) => entry.companyId === company.id);
  const thirdPartyDocuments = thirdPartyInvitations.map(({ companyId: scopedCompanyId, unitId, companyName, unitName, relatedCnpj, contractorName, receipts }) => ({ companyId: scopedCompanyId, unitId, companyName, unitName, relatedCnpj, contractorName, receipts }));
  const tabs = [
    { id: "resumo", label: "Resumo", visible: true },
    { id: "pgr", label: "PGR da empresa", visible: canReadPgr },
    { id: "epi", label: "Gestão de EPI", visible: canReadEpi },
    { id: "pcmso", label: "PCMSO", visible: canReadPcmso },
    { id: "terceiros", label: "Terceiros", visible: canReadThirdParty },
  ].filter((tab) => tab.visible);
  const selectedTab = tabs.some((tab) => tab.id === query.tab) ? query.tab! : "resumo";

  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><Link href="/empresas">Empresas</Link><span className="crumb-separator">/</span><strong>Ficha</strong></div>
      <Link className="secondary-button" href="/empresas">Voltar às empresas</Link>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div><p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p><h1 id="page-title">{company.tradeName || company.legalName}</h1><p className="page-description">Cliente da consultoria · PGR, cadastro e análise documental das suas empresas terceiras.</p></div>
        <span className={`client-status ${company.status === "active" ? "status-active" : "status-archived"}`}>{company.status === "active" ? "Ativa" : "Arquivada"}</span>
      </section>

      <nav className="company-detail-tabs" role="tablist" aria-label="Áreas da empresa">{tabs.map((tab) => <Link key={tab.id} href={`/empresas/${encodeURIComponent(company.id)}?tab=${tab.id}`} role="tab" aria-selected={selectedTab === tab.id} className={selectedTab === tab.id ? "company-detail-tab is-active" : "company-detail-tab"}>{tab.label}</Link>)}</nav>

      {selectedTab === "resumo" && <section className="panel company-detail-panel" aria-labelledby="company-work-title">
        <h2 id="company-work-title">Área de trabalho deste cliente</h2>
        <p>A consultoria acompanha a documentação das terceiras contratadas por {company.tradeName || company.legalName}.</p>
        <div className="client-card-actions">
          {canReadPgr && <Link className="secondary-button" href={`/empresas/${company.id}?tab=pgr`}>Consultar PGR do cliente</Link>}
          {canReadThirdParty && <Link className="primary-button" href={`/empresas/${company.id}?tab=terceiros`}>Analisar terceiros deste cliente · {new Set(thirdPartyInvitations.map(entry => entry.contractorCnpj)).size}</Link>}
        </div>
        {canReadThirdParty && thirdPartyInvitations.length === 0 && <p>Nenhuma terceira vinculada por solicitação documental. Abra Terceiros para informar a contratada, a atividade e os documentos solicitados.</p>}
      </section>}
      {selectedTab === "resumo" && <div className="company-detail">
        <section className="panel company-detail-panel" aria-labelledby="company-details-title">
          <h2 id="company-details-title">Dados da empresa</h2>
          <dl className="company-detail-meta">
            <div><dt>Razão social</dt><dd>{company.legalName}</dd></div>
            {company.contactName && <div><dt>Contato</dt><dd>{company.contactName}</dd></div>}
            {company.contactEmail && <div><dt>E-mail</dt><dd>{company.contactEmail}</dd></div>}
            {company.contactPhone && <div><dt>Telefone</dt><dd>{company.contactPhone}</dd></div>}
          </dl>
          <ul className="company-detail-list">{company.units.map((unit) => <li key={unit.id}><strong>{unit.name}</strong><p>CNPJ {unit.cnpj}{unit.cityState ? ` · ${unit.cityState}` : ""}</p></li>)}</ul>
        </section>

        {canReadWorkers && <section className="panel company-detail-panel" aria-labelledby="company-workers-title">
          <h2 id="company-workers-title">Funções e categorias para análise · {workers.length}</h2>
          {hasTenantPermission(membership.role, "workers.manage") && <Link className="company-workers-link" href="/trabalhadores#worker-list-title">Revisar funções e categorias dos vínculos</Link>}
          {workers.length ? <ul className="company-detail-list">{workers.map((worker) => <li key={worker.id}><strong>{worker.displayName}</strong><p>{worker.jobTitle}</p><small>{worker.riskCategories.length ? `Categorias para revisão: ${worker.riskCategories.join(", ")}` : "Nenhuma categoria registrada"}</small></li>)}</ul> : <p className="page-description">Nenhum vínculo registrado para esta empresa.</p>}
        </section>}

      </div>}

      {selectedTab === "pgr" && digitalization && <PgrWorkingEditor profile={digitalization} history={pgrWorkingHistory} annexes={currentContractorAnnexes(contractorAnnexHistory)} canManage={hasTenantPermission(membership.role, "pgr.manage")} reviewerName="Elias Alves Vieira"/>}
      {selectedTab === "pgr" && digitalization && <PgrContractorAnnexSection profile={digitalization} history={contractorAnnexHistory} canManage={hasTenantPermission(membership.role, "pgr.manage")}/>}
      {selectedTab === "pgr" && digitalization && <CompanyPgrImported profile={digitalization} reviews={readPgrItemReviews(tenant.id, company.id, digitalization.sha256)} canReview={canReviewDocuments}/>}
      {selectedTab === "pgr" && digitalization && <PgrPprDraft profile={digitalization} history={pgrWorkingHistory} unitName={company.units.find(unit => unit.id === digitalization.unitId)?.name ?? "Unidade identificada no PGR"}/>}
      {selectedTab === "pgr" && digitalization && <PgrPcaDraft profile={digitalization} history={pgrWorkingHistory} unitName={company.units.find(unit => unit.id === digitalization.unitId)?.name ?? "Unidade identificada no PGR"}/>}
      {selectedTab === "pgr" && digitalization && <PgrErgonomiaDraft profile={digitalization} history={pgrWorkingHistory} unitName={company.units.find(unit => unit.id === digitalization.unitId)?.name ?? "Unidade identificada no PGR"}/>}
      {selectedTab === "pgr" && digitalization && <PgrLtcatDraft profile={digitalization} history={pgrWorkingHistory} unitName={company.units.find(unit => unit.id === digitalization.unitId)?.name ?? "Unidade identificada no PGR"}/>}
      {selectedTab === "pgr" && canReadPgr && <section className="panel company-detail-panel company-tab-panel" aria-labelledby="company-pgr-title">
          <h2 id="company-pgr-title">PGR e inventário de riscos · {pgrStorageMode === "postgres" ? inventories.length : drafts.length}</h2>
          <h3>Documentos originais da empresa</h3>
          <p>Preserve o original e consulte a extração completa antes de estruturar o inventário.</p>
          {companyDocuments.filter(document => document.kind === "PGR").map(document => <article key={document.id} className="pgr-card"><h4>{document.title} · versão {document.version}</h4><p><a href={`/api/document-files/${document.id}`}>Baixar PDF original</a> · <a href={`/documentos/${document.id}/texto`}>Consultar texto integral por página</a></p></article>)}
          <p className="company-detail-note">PGR elaborado para a própria empresa nesta plataforma. PDFs enviados por contratadas ficam em Terceiros e não substituem este inventário.</p>
          <p className="company-detail-note">Conteúdo de demonstração, pendente de validação profissional e em campo. Não declara conformidade.</p>
          {pgrStorageMode === "postgres" ? inventories.length ? inventories.map((record) => <details className="company-pgr" key={record.id}><summary>{record.inventory.title} · {pgrStatus[record.status]}</summary><div className="company-pgr-content"><h3>Atividades e contexto</h3><p>{record.inventory.activityDescription}</p><h3>Riscos estruturados · {record.inventory.items.length}</h3>{record.inventory.items.map((item) => <article className="pgr-risk-entry" key={item.id}><h4>{item.hazard || "Perigo a detalhar"}</h4><p>{item.sourceCircumstance || "Fonte/circunstância a registrar."}</p><p>{item.possibleHarm || "Possíveis agravos a avaliar."}</p>{item.esocialTable24 && <p><strong>Associação manual à Tabela 24/S-2240:</strong> {item.esocialTable24.code} · {item.esocialTable24.label}. Fundamentação registrada: {item.esocialTable24.rationale} · Snapshot {item.esocialTable24.catalogVersion}; aplicabilidade e vigência não são validadas.</p>}</article>)}{record.inventory.legacySource && <><h3>Relato legado preservado</h3><p>{record.inventory.legacySource.snapshots.at(-1)?.riskInventory}</p></>}<h3>Plano de ação</h3><p>{record.inventory.actionPlan}</p></div></details>) : <p className="page-description">Nenhum inventário de PGR registrado para esta empresa.</p> : drafts.length ? drafts.map((draft) => <details className="company-pgr" key={draft.id}><summary>{draft.title} · {pgrStatus[draft.status] ?? draft.status}</summary><div className="company-pgr-content"><h3>Atividades e contexto</h3>{draft.activityDescription}<h3>Perigos e riscos registrados</h3>{draft.riskInventory}<h3>Plano de ação</h3>{draft.actionPlan}</div></details>) : <p className="page-description">Nenhum rascunho de PGR registrado para esta empresa.</p>}
        </section>}

      {selectedTab === "epi" && canReadEpi && <section className="panel company-detail-panel company-tab-panel" aria-labelledby="company-epi-title"><h2 id="company-epi-title">Gestão de EPI · {company.tradeName||company.legalName}</h2><p>Controle de estoque, CA e validade por lote, entrega em ficha, devolução e custos atribuídos à área/setor dos colaboradores desta empresa.</p><p className="company-detail-note"><strong>Escopo desta tela:</strong> os registros e as movimentações são filtrados para {company.tradeName||company.legalName}. Neste ambiente demonstrativo, o acesso ainda é feito pela equipe da consultoria; o acesso independente da conta da empresa depende de configurar o vínculo autenticado da EMA.</p><div className="client-card-actions"><Link className="primary-button" href={`/epi/entregas?companyId=${encodeURIComponent(company.id)}`}>Abrir entregas e fichas</Link><Link className="secondary-button" href={`/epi/estoque?companyId=${encodeURIComponent(company.id)}`}>{canManageEpi?"Abrir estoque e custos":"Consultar estoque e custos"}</Link></div></section>}

      {selectedTab === "pcmso" && canReadPcmso && <><section className="panel company-detail-panel company-tab-panel" aria-labelledby="company-pcmso-title"><h2 id="company-pcmso-title">PCMSO desta empresa</h2>{companyPcmsoSummaries.length ? <ul className="company-detail-list">{companyPcmsoSummaries.map((record) => <li key={record.id}><strong>{record.unitName} · versão {record.version}</strong><p>{record.status === "reviewed" ? "Revisão interna registrada" : record.status === "in_review" ? "Em revisão" : "Rascunho"}</p><small>Atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(record.updatedAt))}</small></li>)}</ul> : <p className="page-description">Nenhum PCMSO vinculado a esta empresa.</p>}</section>{digitalization && <PgrPcmsoDraft profile={digitalization} history={pgrWorkingHistory} unitName={company.units.find(unit => unit.id === digitalization.unitId)?.name ?? "Unidade identificada no PGR"}/>}</>}

      {selectedTab === "terceiros" && canReadThirdParty && <div className="company-thirdparty-tab"><p className="company-detail-note"><strong>Terceiros de {company.tradeName || company.legalName}:</strong> analise os documentos das contratadas para as atividades solicitadas. Consulte o PGR do cliente na aba PGR da empresa. O relatório consolidado será formado após as avaliações profissionais; recebimento não significa aprovação.</p><ThirdPartySection invitations={thirdPartyInvitations} companies={[company]} canManage={canManageThirdParty} canReview={canReviewDocuments}/>{canReviewDocuments && <ComplianceSection rules={complianceRules} evaluations={companyEvaluations} documents={companyDocuments} thirdPartyDocuments={thirdPartyDocuments} canManage={false} canReview currentDate={new Date().toISOString().slice(0, 10)}/>}</div>}
    </div>
  </main>;
}
