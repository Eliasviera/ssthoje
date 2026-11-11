import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listSafetyAprs } from "@/lib/safety-operations-store";
import { listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import { getPgrStorageMode } from "@/lib/pgr-storage-mode";
import { getWorkPermitDraft, listWorkPermitDrafts } from "@/lib/work-permit-draft-store";
import { loadVocabulary } from "@/lib/field-vocabulary";
import type { PgrInventoryRecord } from "@/lib/pgr-postgres-operations";
import { assessWorkPermitReadiness, WORK_PERMIT_BLOCKERS, WORK_PERMIT_PTE_TYPES, WORK_PERMIT_TYPES } from "@/lib/work-permit-readiness";
import { WORK_PERMIT_SOURCE_COVERAGE, WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";
import WorkPermitSourceFormPreview from "./work-permit-source-form-preview";
import WorkflowPreview from "./workflow-preview";
import DocumentSignatures from "../document-signatures";
import { getWorkPermitSignatureState, type WorkPermitSignatureState } from "@/lib/work-permit-signature-store";
import { listWorkersForTenant } from "@/lib/worker-store";
import { pendingDocumentSigners } from "@/lib/document-signatures";

export default function Page({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  return <Suspense fallback={<main className="auth-loading">Conferindo vínculos de PT/PTE…</main>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  await connection();
  const params = await searchParams;
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const aprs = listSafetyAprs(tenant.id);
  const permitAprOptions = aprs.map((apr) => {
    const company = companies.find((item) => item.id === apr.companyId && item.tenantId === tenant.id);
    return { id: apr.id, title: apr.title, revision: apr.revision, status: apr.status, companyName: company?.tradeName || company?.legalName || "", unitName: company?.units.find((unit) => unit.id === apr.unitId)?.name ?? "", workArea: apr.workArea, activityStage: apr.activityStage };
  });
  const permitDrafts = await listWorkPermitDrafts(tenant.id);
  const vocabulary = loadVocabulary().entries;
  const permitWorkers = listWorkersForTenant(tenant.id).filter((worker) => worker.status === "active")
    .map((worker) => ({ id: worker.id, name: worker.displayName, jobTitle: worker.jobTitle, companyId: worker.companyId, unitId: worker.unitId }));
  const permitSignatureStates = new Map<string, WorkPermitSignatureState>();
  for (const draft of permitDrafts) permitSignatureStates.set(draft.id, getWorkPermitSignatureState(tenant.id, draft.id));
  const selectedDraft = params.draft && params.draft.length <= 36 ? await getWorkPermitDraft(tenant.id, params.draft) : null;
  let inventories: PgrInventoryRecord[] | null = null;
  // Sem APR não há vínculo a conferir; não consulta o banco desnecessariamente.
  if (aprs.length && getPgrStorageMode() === "postgres") {
    try { inventories = await listPgrInventoriesPostgres(tenant.id); } catch { inventories = null; }
  }
  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar"><Link className="secondary-button" href="/#safety-apr">Voltar à APR</Link><Link className="secondary-button" href="/?section=pgr">Consultar PGR</Link></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">{tenant.name} · DEMONSTRAÇÃO</p><h1>Preparação de PT e PTE</h1><p className="page-description">Confira a origem dos riscos na APR e no PGR e o fluxo solicitado pela equipe.</p></div></section>
      <section className="panel pgr-section" aria-label="Preparação de permissões de trabalho">
        <div className="document-warning"><strong>Emissão indisponível.</strong> Esta tela consulta vínculos e oferece um ensaio demonstrativo. Não cria permissão operacional, não aprova APR e não autoriza trabalho. O mapa estrutural dos Word está disponível para revisão; os critérios e checklists técnicos ainda aguardam validação. Liberação operacional e assinatura qualificada (ICP-Brasil) não estão disponíveis; a ciência dos participantes no rascunho é registro simples, sem liberar trabalho.</div>
        <h2>Permissão de Trabalho Especial (PTE)</h2><ul>{WORK_PERMIT_PTE_TYPES.map(type => <li key={type.label}><strong>{type.label}:</strong> {type.status}</li>)}</ul>
        <h2>Permissões de Trabalho (PT) previstas</h2><ul>{WORK_PERMIT_TYPES.map(type => <li key={type.label}><strong>{type.label}:</strong> {type.status}{"note" in type && <> {type.note}</>}</li>)}</ul>
        <p>Essa separação é apenas organização do produto, não classificação normativa automática. Não há parâmetros normativos nem modelo operacional implementados para esses tipos.</p>
        <details className="pgr-card"><summary>Estrutura identificada nos Word · rascunho para revisão</summary><p>Esta leitura agrupa campos e seções para discussão. Não define critérios, aprova texto técnico, verifica treinamento, aplica travas nem libera atividade.</p>{WORK_PERMIT_SOURCE_FIELD_MAPS.map(map => <section key={map.id}><h3>{map.title}</h3><p className="period-label">{map.reviewStatus === "technical_review_pending" ? "Revisão técnica pendente" : "Status da fonte não definido"}</p><p>{map.source}</p>{map.sections.map(section => <div key={section.id}><h4>{section.title}</h4><ul>{section.fields.map(field => <li key={field.id}>{field.label}</li>)}</ul></div>)}</section>)}<h3>Fontes por tipo do catálogo</h3><ul>{WORK_PERMIT_SOURCE_COVERAGE.map(item => <li key={item.id}><strong>{item.type}:</strong> {item.source}</li>)}</ul></details>
        <WorkPermitSourceFormPreview key={`pte-${selectedDraft?.mapId === "pte-confined-space" ? selectedDraft.id : "new"}`} mapId="pte-confined-space" aprOptions={permitAprOptions} vocabulary={vocabulary} draft={selectedDraft?.mapId === "pte-confined-space" ? selectedDraft : undefined}/>
        <WorkPermitSourceFormPreview key={`hot-${selectedDraft?.mapId === "hot-work-composite" ? selectedDraft.id : "new"}`} mapId="hot-work-composite" aprOptions={permitAprOptions} vocabulary={vocabulary} draft={selectedDraft?.mapId === "hot-work-composite" ? selectedDraft : undefined}/>
        <h2>Rascunhos demonstrativos salvos · {permitDrafts.length}{permitDrafts.filter((draft) => pendingDocumentSigners(permitSignatureStates.get(draft.id)?.signers ?? [], permitSignatureStates.get(draft.id)?.signatures ?? []).length > 0).length > 0 ? ` · ${permitDrafts.filter((draft) => pendingDocumentSigners(permitSignatureStates.get(draft.id)?.signers ?? [], permitSignatureStates.get(draft.id)?.signatures ?? []).length > 0).length} com assinatura pendente` : ""}</h2>
        {!permitDrafts.length ? <p className="permission-note">Ainda não há rascunhos salvos nesta consultoria.</p> : permitDrafts.map((draft) => {
          const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === draft.mapId);
          const linkedApr = draft.aprId ? aprs.find((apr) => apr.id === draft.aprId) : null;
          const filledCount = Object.values(draft.values).filter(Boolean).length;
          const draftLinkedCompanyId = draft.aprId ? aprs.find((apr) => apr.id === draft.aprId)?.companyId : undefined;
          return <article className="pgr-card" key={draft.id}><header><div><h3>{draft.title}</h3><p>{source?.title ?? "Modelo indisponível"} · revisão {draft.revision} · atualizado {new Date(draft.updatedAt ?? draft.createdAt).toLocaleString("pt-BR")}</p></div><span className="period-label">Rascunho demonstrativo</span></header><p>{filledCount} campo(s) preenchido(s). Criado por conta autenticada; revisão técnica pendente. Não libera atividade.</p><p>APR vinculada: {linkedApr ? `${linkedApr.title} · revisão ${linkedApr.revision}` : draft.aprId ? "vínculo indisponível nesta consultoria" : "nenhuma"}.</p><p><Link className="secondary-button" href={`/permissoes-trabalho?draft=${encodeURIComponent(draft.id)}#permit-form-${draft.mapId}`}>Reabrir e editar</Link></p>
          <DocumentSignatures kind="pt" recordId={draft.id} signers={permitSignatureStates.get(draft.id)?.signers ?? []} signatures={permitSignatureStates.get(draft.id)?.signatures ?? []} issuerDefault="" canManage workers={draftLinkedCompanyId ? permitWorkers.filter((worker) => worker.companyId === draftLinkedCompanyId) : permitWorkers}/><details><summary>Histórico de versões · {draft.revisionHistory?.length ?? 0}</summary><ol>{draft.revisionHistory?.map((entry) => <li key={entry.revision}>Versão {entry.revision} · {new Date(entry.occurredAt).toLocaleString("pt-BR")} · <Link href={`/permissoes-trabalho/historico?draft=${encodeURIComponent(draft.id)}&revision=${entry.revision}`}>Consultar versão {entry.revision}</Link>{entry.revision !== draft.revision && <>{" · "}<Link href={`/permissoes-trabalho/comparar?draft=${encodeURIComponent(draft.id)}&left=${entry.revision}&right=${draft.revision}`}>Comparar versão {entry.revision} com {draft.revision}</Link></>}</li>)}</ol><p>As versões registram salvamentos do rascunho. Não representam revisão técnica nem liberação.</p></details><details><summary>Ver dados da versão atual</summary>{source?.sections.map((section) => {
            const sectionValues = section.fields.map((field) => ({ label: field.label, value: draft.values[`${section.id}.${field.id}`] })).filter((item) => item.value);
            return sectionValues.length ? <section key={section.id}><h4>{section.title}</h4><dl>{sectionValues.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section> : null;
          })}</details></article>;
        })}
        <h2>Fluxo definido pela equipe · implementação pendente</h2><ul><li><strong>Líder ou supervisor:</strong> preenche o documento em campo e libera a atividade.</li><li><strong>TST:</strong> audita os riscos e as medidas de controle adotadas na atividade.</li><li><strong>Demais integrantes:</strong> assinam sua participação, sem poder de liberação.</li></ul><p>O perfil de administrador da consultoria não será convertido automaticamente em líder ou supervisor da atividade. Nome digitado não comprova identidade, autoridade ou assinatura.</p>
        <h2>O que falta para a próxima etapa</h2><ol><li>Revisar o mapa estrutural extraído dos Word e validar critérios, referências e versões por tipo. Para Altura e Mergulho profissional, ainda não foi localizado formulário-fonte. A data de vigência da NR-35 não é requisito de registro.</li><li>Para operação real, criar vínculos autenticados por atividade/APR e o histórico de preenchimento, liberação, auditoria e assinaturas; o simulador já permite escolher empresa/unidade e funcionário fictício ativo desse escopo, sem default, mas não cria APR nem autentica autoridade.</li><li>Concluir a correspondência entre os tipos de PT e os riscos/controles da atividade. A APR já separa riscos da base PGR, riscos adicionais da avaliação e medidas adicionais; falta validar essa seleção por tipo de trabalho, sem inferência automática.</li></ol>
        <h2>Tratamento de não conformidades · fluxo solicitado</h2><ol><li>O checklist registra a situação de campo. Havendo NC, aguarda reavaliação do TST quando disponível.</li><li>O TST registra evidências e sua avaliação dos itens; essa avaliação não é apagada pela decisão posterior.</li><li>Persistindo NC, ou na empresa sem TST, o supervisor decide aguardar a adequação ou registra sua decisão de prosseguir com a pendência e a justificativa.</li><li>Prosseguir com NC não altera o item para conforme. A decisão, a pendência e a conta responsável precisam permanecer identificadas.</li></ol>
        <WorkflowPreview/>
        <h2>Vínculos APR → PGR · {aprs.length} APR(s)</h2>
        {!aprs.length && <p className="permission-note">Nenhuma APR cadastrada nesta consultoria. Primeiro configure o checklist e elabore a APR com riscos selecionados de um PGR aprovado. Riscos percebidos apenas na tarefa podem ser registrados como adicionais na APR, sem alterar o PGR; a necessidade de revisar o inventário continua sendo decisão humana.</p>}
        {aprs.map(apr => {
          const check = assessWorkPermitReadiness(tenant.id, apr, inventories, companies);
          const company = companies.find(item => item.id === apr.companyId && item.tenantId === tenant.id);
          return <article className="pgr-card" key={apr.id}><header><div><h3>{apr.title}</h3><p>{company?.tradeName || company?.legalName || "Empresa indisponível"} · {company?.units.find(unit => unit.id === apr.unitId)?.name || "Unidade indisponível"}</p></div><span className="period-label">Sem emissão</span></header>
            <p>APR revisão {apr.revision} · PGR de origem: {apr.pgrTitle}, revisão {apr.pgrRevision}</p>
            <p>{check.linksVerified ? "Correspondência estrutural dos riscos conferida. Isso não confirma adequação técnica nem autoriza a atividade." : "Correspondência estrutural dos riscos ainda não confirmada."}</p>
            <ul>{check.blockers.map(code => <li key={code}>{WORK_PERMIT_BLOCKERS[code]}</li>)}</ul>
            {check.risks.length > 0 && <details><summary>Riscos e medidas registrados na fonte · {check.risks.length}</summary>{check.risks.map(risk => <section key={risk.id}><h4>{risk.activity} · {risk.hazard}</h4>{risk.existingMeasures.length ? <ul>{risk.existingMeasures.map((measure, index) => <li key={index}>{measure}</li>)}</ul> : <p>Sem medidas registradas na fonte.</p>}</section>)}</details>}
            {(apr.additionalRisks?.length || apr.additionalPgrControls?.length) ? <details><summary>Riscos e controles adicionais da avaliação · {(apr.additionalRisks?.length ?? 0) + (apr.additionalPgrControls?.length ?? 0)}</summary>
              {apr.additionalRisks?.length ? <section><h4>Riscos adicionais · {apr.additionalRisks.length}</h4><ul>{apr.additionalRisks.map(risk => <li key={risk.id}><strong>{risk.hazard}</strong>{risk.possibleHarm ? ` · possível dano: ${risk.possibleHarm}` : ""}{risk.identificationBasis ? ` · identificado em: ${risk.identificationBasis}` : ""}{risk.controls.length ? <ul>{risk.controls.map((control, index) => <li key={index}>{control}</li>)}</ul> : <p>Sem medida adicional registrada.</p>}</li>)}</ul></section> : null}
              {apr.additionalPgrControls?.length ? <section><h4>Medidas adicionais para riscos do PGR · {apr.additionalPgrControls.length}</h4><ul>{apr.additionalPgrControls.map(control => { const risk = apr.risks.find(item => item.riskId === control.riskId); return <li key={control.id}><strong>{risk ? `${risk.activity} · ${risk.hazard}` : `Risco ${control.riskId}`}:</strong> {control.description}</li>; })}</ul></section> : null}
              <p>Esses registros são adicionais à base PGR e não alteram o inventário aprovado. A adequação e a necessidade de revisar o PGR dependem de avaliação humana.</p>
            </details> : null}
          </article>;
        })}
      </section>
    </div>
  </main>;
}
