"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { InvitationSummary } from "@/lib/third-party-store";
import type { ThirdPartyGateOverview } from "@/lib/third-party-gate-read-store";
import type { LegacyInvitationCaseLinkState, LegacyInvitationCaseOption } from "@/lib/third-party-legacy-invitation-read-service";
import { THIRD_PARTY_DOCUMENT_KINDS } from "@/lib/third-party-policy";
import type { PgrPdfImportResult, PgrPdfImportRisk } from "@/lib/pgr-pdf-import";
import { createInvitationAction, revokeInvitationAction, renewInvitationAction, type InvitationFormState } from "./third-party-actions";
import LegacyInvitationLinkPanel from "./legacy-invitation-link-panel";
import { loadLegacyInvitationLinkReviewAction, type M22ReviewDataState } from "./third-party-legacy-invitation-actions";

function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function streamKey(invite: InvitationSummary, kind: string) { return `${invite.companyId}|${invite.unitId}|${invite.contractorCnpj}|${invite.scope?.trim().toLocaleLowerCase("pt-BR") || invite.id}|${kind}`; }
function InviteForm({ companies }: { companies: ClientCompany[] }) {
  // Wrapper no cliente: o resultado anterior com o link nunca volta como argumento à ação do servidor.
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => createInvitationAction(data), {});
  const [copyMessage, setCopyMessage] = useState("");
  const [selectedCompanyUnit, setSelectedCompanyUnit] = useState(() => companies.length === 1 && companies[0].status === "active" && companies[0].units.length === 1 ? `${companies[0].id}|${companies[0].units[0].id}` : "");
  const [selectedRequested, setSelectedRequested] = useState<string[]>(() => companies.length === 1 && companies[0].status === "active" && companies[0].units.length === 1 ? (companies[0].thirdPartyRequirements ?? []).filter(kind => THIRD_PARTY_DOCUMENT_KINDS.includes(kind as typeof THIRD_PARTY_DOCUMENT_KINDS[number])) : []);
  const [medicalAsoRequired, setMedicalAsoRequired] = useState(() => companies.length === 1 && companies[0].status === "active" && companies[0].units.length === 1 && Boolean(companies[0].thirdPartyRequirements?.includes("ASO")));
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PgrPdfImportResult | null>(null);
  const [importError, setImportError] = useState("");

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pgr/import-pdf", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setImportResult(data.extracted);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!companies.some(c => c.status === "active")) return <p className="permission-note">Cadastre uma empresa e unidade ativas antes de criar um convite.</p>;
  return <><div className="pgr-form thirdparty-form" style={{ marginBottom: "1rem" }}>
    <label className="form-field pgr-wide">
      <span>Importar PGR/RH em PDF (baixar dados para o sistema)</span>
      <input ref={fileRef} type="file" accept="application/pdf" onChange={handleImport} disabled={importing} />
    </label>
    {importing && <p className="permission-note">Importando e extraindo dados do PDF...</p>}
    {importError && <p className="client-form-message client-form-error">{importError}</p>}
    {importResult && <div className="pgr-card" style={{ marginTop: "0.5rem" }}>
      <header><div><h4>Pré-visualização da importação</h4><p>{importResult.company?.legalName || importResult.company?.tradeName} {importResult.company?.cnpj ? `· ${importResult.company.cnpj}` : ""}</p></div></header>
      {importResult.workers && importResult.workers.length > 0 ? <>
        <p><strong>Colaboradores extraídos:</strong> {importResult.workers.length}</p>
        <ul>{importResult.workers.slice(0, 10).map((w) => <li key={w.id}><strong>{w.name || w.role}:</strong> {w.registration ? `Matrícula: ${w.registration}` : ""} {w.role && w.name ? `· Cargo/Função: ${w.role}` : w.role ? `Cargo/Função: ${w.role}` : ""} {w.raw?.CPF ? `· CPF: ${w.raw.CPF}` : w.raw?.["CPF"] ? `· CPF: ${w.raw["CPF"]}` : ""} {w.raw?.["Data de Nascimento"] || w.raw?.["Nascimento"] ? `· Nasc.: ${w.raw["Data de Nascimento"] || w.raw["Nascimento"]}` : ""}</li>)}</ul>
        {importResult.workers.length > 10 && <p className="permission-note">... e mais {importResult.workers.length - 10} colaboradores</p>}
      </> : <>
        <p><strong>Unidade:</strong> {importResult.unit?.name} · <strong>Inventário:</strong> {importResult.inventory?.title} · {importResult.inventory?.revision}</p>
        <p><strong>Riscos/Funções extraídos:</strong> {importResult.risks?.length || 0}</p>
        <ul>{(importResult.risks || []).slice(0, 8).map((r: PgrPdfImportRisk) => <li key={r.id}><strong>{r.activity}:</strong> {r.hazard}</li>)}</ul>
        {(importResult.risks?.length || 0) > 8 && <p className="permission-note">... e mais {(importResult.risks?.length || 0) - 8} itens</p>}
      </>}
      <p className="permission-note">Dados baixados para uso no sistema. Use-os ao criar o convite ou ao vincular na APR.</p>
    </div>}
  </div><form action={action} className="pgr-form thirdparty-form">
    <div className="form-field"><label htmlFor="third-company">Cliente e unidade relacionada</label><select id="third-company" name="companyUnit" required value={selectedCompanyUnit} onChange={(event) => { const value = event.target.value; setSelectedCompanyUnit(value); const [companyId] = value.split("|"); const selectedCompany = companies.find((company) => company.id === companyId); const policy = selectedCompany?.thirdPartyRequirements ?? []; setSelectedRequested(policy.filter((kind) => THIRD_PARTY_DOCUMENT_KINDS.includes(kind as typeof THIRD_PARTY_DOCUMENT_KINDS[number]))); setMedicalAsoRequired(policy.includes("ASO")); }}><option value="" disabled>Selecione</option>{companies.filter(c => c.status === "active").flatMap(c => c.units.map(u => <option key={u.id} value={`${c.id}|${u.id}`}>{c.tradeName || c.legalName} · {u.name} · {u.cnpj}</option>))}</select></div>
    <div className="form-field"><label htmlFor="third-name">Nome da empresa contratada fictícia</label><input id="third-name" name="contractorName" required maxLength={140}/></div>
    <div className="form-field"><label htmlFor="third-cnpj">CNPJ fictício da contratada</label><input id="third-cnpj" name="contractorCnpj" required inputMode="numeric" maxLength={24} placeholder="14 dígitos fictícios"/></div>
    <div className="form-field pgr-wide"><label htmlFor="third-scope">Escopo / atividade contratada (riscos não rotineiros / fora do processo)</label><input id="third-scope" name="scope" required maxLength={240} placeholder="Ex.: Reparos em alvenaria e ajustes com argamassa/cimento – uso de rompedor, betoneira, ferramentas manuais/elétricas"/><p className="aso-help">Descreva a atividade <strong>pontual e não rotineira</strong>, fora do processo operacional da contratante. Informe também ferramentas, equipamentos ou acessos (rompedor/martelete, betoneira, escada, andaime, ferramentas elétricas). Esse texto é usado para gerar a <strong>Orientação de riscos complementares do PGR</strong>.</p></div>
    <div className="form-field"><label htmlFor="third-expiry">Duração técnica do link</label><select id="third-expiry" name="expiresInHours" defaultValue="24"><option value="1">1 hora</option><option value="24">24 horas</option><option value="168">7 dias</option></select><p className="aso-help">Controla somente o acesso ao portal; não é prazo legal de entrega ou validade documental.</p></div>
    <fieldset className="aso-exams pgr-wide"><legend>Documentos não médicos · link público</legend><div className="thirdparty-checks">{THIRD_PARTY_DOCUMENT_KINDS.map(kind => <label key={kind}><input type="checkbox" name="requested" value={kind} checked={selectedRequested.includes(kind)} onChange={(event) => setSelectedRequested((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))}/>{kind}</label>)}</div></fieldset>
    <label className="thirdparty-medical-policy"><input type="checkbox" name="medicalAsoRequired" value="true" checked={medicalAsoRequired} onChange={(event) => setMedicalAsoRequired(event.target.checked)}/> ASO dos trabalhadores terceiros · revisão médica restrita, relacionada às atividades e aptidões previstas no PGR/PCMSO do terceiro; não será enviado por este link</label>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
    <div className="pgr-form-footer"><p>O link permite envio sem login exclusivamente para esta solicitação. Use somente dados e PDFs fictícios.</p><button className="primary-button" disabled={pending}>{pending ? "Criando…" : "Criar link de envio"}</button></div>
  </form>{state.success && <div className="permission-note" role="status"><p>{state.success}</p>{state.link && <div className="pcmso-buttons"><a className="primary-button" href={state.link} target="_blank" rel="noreferrer">Abrir portal de demonstração</a><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${state.link}`); setCopyMessage("Link local copiado."); } catch { setCopyMessage("Abra o portal e copie o endereço na barra do navegador."); } }}>Copiar link local</button></div>}<p>{copyMessage}</p></div>}</>;
}
function RevokeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => revokeInvitationAction(data), {});
  return <form action={action}><input type="hidden" name="invitationId" value={id}/><button className="secondary-button" disabled={pending}>Revogar link</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
function RenewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => renewInvitationAction(data), {});
  return <div><form action={action}><input type="hidden" name="invitationId" value={id}/><button className="secondary-button" disabled={pending}>Gerar novo link local · 24 horas</button></form><p>Invalida o endereço anterior. PDFs e pendências permanecem preservados.</p>{state.error && <p role="alert">{state.error}</p>}{state.success && <div role="status"><p>{state.success}</p>{state.link && <a className="primary-button" href={state.link} target="_blank" rel="noreferrer">Abrir portal atualizado</a>}</div>}</div>;
}
export default function ThirdPartySection({ invitations, companies, canManage, canReview = false, gate = null, caseOptions = [], caseLinkStates = [] }: { invitations: InvitationSummary[]; companies: ClientCompany[]; canManage: boolean; canReview?: boolean; gate?: ThirdPartyGateOverview | null; caseOptions?: LegacyInvitationCaseOption[]; caseLinkStates?: LegacyInvitationCaseLinkState[] }) {
  const [initiallyOpen] = useState(invitations.length === 0);
  const invitationIds = invitations.map((invitation) => invitation.id);
  const invitationKey = invitationIds.join("\u001f");
  const [linkReview, setLinkReview] = useState<{ key: string; result: M22ReviewDataState }>({ key: "", result: {} });
  useEffect(() => {
    let active = true;
    if (!canReview || !invitationKey) return () => { active = false; };
    loadLegacyInvitationLinkReviewAction(invitationKey.split("\u001f")).then((result) => {
      if (active) setLinkReview({ key: invitationKey, result });
    }).catch(() => {
      if (active) setLinkReview({ key: invitationKey, result: { error: "A revisão de vínculos não foi carregada. Atualize a página e tente novamente." } });
    });
    return () => { active = false; };
  }, [canReview, invitationKey]);
  const supersededReceiptIds = new Set(invitations.flatMap((invite) => invite.receipts.map((receipt) => receipt.replacesReceiptId).filter((id): id is string => Boolean(id))));
  const latestReceiptByStream = new Map<string, { id: string; receivedAt: string }>();
  for (const invite of invitations) for (const receipt of invite.receipts) {
    const stream = streamKey(invite, receipt.kind);
    const current = latestReceiptByStream.get(stream);
    if (!current || current.receivedAt.localeCompare(receipt.receivedAt) < 0) latestReceiptByStream.set(stream, { id: receipt.id, receivedAt: receipt.receivedAt });
  }
  const invitationCounts = {
    active: invitations.filter(invite => invite.linkStatus === "active").length,
    expired: invitations.filter(invite => invite.linkStatus === "expired").length,
    revoked: invitations.filter(invite => invite.linkStatus === "revoked").length,
  };
  const currentReview = linkReview.key === invitationKey ? linkReview.result : undefined;
  const activeCaseOptions = currentReview?.cases ?? caseOptions;
  const currentCaseLinkStates = currentReview?.states ?? caseLinkStates;
  const caseLinkStateByInvitation = new Map(currentCaseLinkStates.map((state) => [state.invitationId, state]));
  return <section className="panel pgr-section pcmso-section thirdparty-section" aria-labelledby="thirdparty-heading"><div className="panel-heading"><div><h2 id="thirdparty-heading">Terceiros · análise documental</h2><p>Acompanhe as contratadas do cliente, solicite documentos e encaminhe os recebimentos para análise.</p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>Somente dados e PDFs fictícios, sem conteúdo médico.</strong> Receber um arquivo não significa aprová-lo. Quem possui o link pode enviar; o convite não comprova a identidade de uma pessoa.</div>
    <dl className="thirdparty-overview" aria-label="Resumo dos convites">
      <div><dt>Links ativos</dt><dd>{invitationCounts.active}</dd></div>
      <div><dt>Expirados</dt><dd>{invitationCounts.expired}</dd></div>
      <div><dt>Revogados</dt><dd>{invitationCounts.revoked}</dd></div>
    </dl>
    {canReview && <nav className="thirdparty-tools" aria-label="Ferramentas de Terceiros"><a className="secondary-button" href="/relatorios/terceiros">Avaliações documentais</a><a className="primary-button" href="/integracoes/terceiros">Relatório de mobilização</a><a className="secondary-button" href="/configuracoes/terceiros">Política de rigor</a></nav>}
    {canReview && invitations.length > 0 && !currentReview && <p className="permission-note" role="status">Carregando casos e estados de vínculo do PostgreSQL…</p>}
    {canReview && currentReview?.error && <p className="client-form-message client-form-error" role="alert">{currentReview.error}</p>}
    {canManage ? <details className="aso-new" open={initiallyOpen}><summary>Vincular terceira e solicitar documentos</summary><InviteForm companies={companies}/></details> : <p className="permission-note">Seu perfil pode acompanhar e baixar recebimentos. A administradora cria e revoga os links.</p>}
    {gate && <details className="thirdparty-gate"><summary>Checklist e critérios em teste · {gate.requirementSets.length} checklist(s) · {gate.rules.length} critério(s)</summary><section className="permission-note"><strong>Checklist versionado em teste</strong>{gate.requirementSets.map(set => { const company = companies.find(item => item.id === set.companyId); const unit = company?.units.find(item => item.id === set.unitId); const medicalItem = set.items.find(item => item.medicalRestricted); return <p key={set.id}><strong>{company?.tradeName || company?.legalName || "Empresa"} · {unit?.name || "Unidade"}</strong><br/>{set.items.map(item => `${item.documentKind}${item.medicalRestricted ? " · revisão médica restrita" : ""}`).join(" · ")}{medicalItem?.restrictedNote && <><br/><span>ASO: {medicalItem.restrictedNote} Resultado inconclusivo: revisão médica necessária.</span></>}</p>; })}{gate.rules.length > 0 && <p><strong>Critérios ativos</strong>{gate.rules.map(rule => <span key={rule.id}><br/>{rule.documentKind} · {rule.title} · versão {rule.version} · revisão: {rule.reviewer}</span>)}</p>}</section></details>}
    <div className="pgr-records"><h3>Solicitações e recebimentos · {invitations.length}</h3>{invitations.length ? invitations.map(invite => <details className="pgr-card thirdparty-invitation" key={invite.id}><summary className="thirdparty-invitation-summary"><span><strong>{invite.contractorName}</strong><small>{invite.companyName} · {invite.unitName}{invite.scope ? ` · ${invite.scope}` : ""}</small></span><span className={`thirdparty-status thirdparty-status-${invite.linkStatus}`}>{invite.linkStatus === "revoked" ? "Revogado" : invite.linkStatus === "expired" ? "Expirado" : "Ativo"}</span></summary><div className="thirdparty-invitation-content"><header><div><h4>{invite.contractorName}</h4><p>CNPJ fictício: {invite.contractorCnpj}</p><p>Cliente: {invite.companyName} · {invite.unitName} · CNPJ relacionado: {invite.relatedCnpj}</p>{invite.scope && <p>Escopo: {invite.scope}</p>}</div></header>
      <p>Expiração técnica: {date(invite.expiresAt)} (Brasília)</p><LegacyInvitationLinkPanel invitation={invite} cases={activeCaseOptions} state={caseLinkStateByInvitation.get(invite.id)} canReview={canReview} reviewLoading={canReview && !currentReview}/><ul className="thirdparty-requested">{invite.requested.map(kind => { const stream = streamKey(invite, kind); return <li key={kind}><strong>{kind}</strong> · {latestReceiptByStream.has(stream) ? "Recebido — aguarda avaliação humana" : "Aguardando envio"}</li>; })}{invite.medicalAsoRequired && <li><strong>ASO dos trabalhadores terceiros</strong> · avaliação médica restrita, conferindo aptidões com atividades e riscos do PGR/PCMSO do terceiro; fora do link público</li>}</ul>
      {invite.receipts.map(r => { const stream = streamKey(invite, r.kind); const current = !supersededReceiptIds.has(r.id) && latestReceiptByStream.get(stream)?.id === r.id; return <div className="thirdparty-receipt" key={r.id}><p><strong>{r.kind}</strong> · {r.fileName} · {date(r.receivedAt)} (Brasília) · {current ? "Versão atual, aguardando avaliação humana" : "Histórico preservado · versão substituída"}</p><p>Validade informada no documento: {r.validUntil ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${r.validUntil}T12:00:00Z`)) : "não informada"}.</p><p>Protocolo: {r.id}</p><a className="secondary-button" href={`/api/third-party-files/${r.id}`}>Baixar PDF recebido</a></div>; })}
      {(invite.issues ?? []).some(i => i.status !== "resolved") && <p className="permission-note">Há correção ou reavaliação em andamento. Acompanhe na área Pendências.</p>}
      {canManage && !invite.revokedAt && <div className="thirdparty-management"><a className="secondary-button" href={`/empresas/${invite.companyId}?tab=pgr&annex=new&origin=third_party_mobilization&invitationId=${invite.id}&contractorName=${encodeURIComponent(invite.contractorName)}&contractorCnpj=${encodeURIComponent(invite.contractorCnpj)}&scope=${encodeURIComponent(invite.scope || "")}&unitId=${invite.unitId}`}>Gerar avaliação/orientação de riscos complementares</a><RenewForm id={invite.id}/><RevokeForm id={invite.id}/></div>}
    </div></details>) : <p className="client-empty">Nenhuma terceira vinculada por solicitação neste contexto. Use “Vincular terceira e solicitar documentos” para iniciar o acompanhamento.</p>}</div>
  </section>;
}
