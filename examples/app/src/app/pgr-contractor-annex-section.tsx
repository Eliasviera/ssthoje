"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import { ANNEX_FIELDS, ANNEX_STATUS, needsContractorRiskReview, type ContractorAnnex } from "@/lib/pgr-contractor-annex";
import { saveContractorAnnexAction, type AnnexState } from "./pgr-contractor-annex-actions";
import { AnnexContent } from "./pgr-contractor-annex-document";
import { findContractorRiskTemplate } from "@/lib/pgr-contractor-risk-templates";
import { getContractorRiskSuggestions } from "@/lib/pgr-contractor-risk-catalog";

function Form({ profile, record, operation = "save", prefill }: { profile: ImportedPgrProfile; record?: ContractorAnnex; operation?: "save" | "include" | "close"; prefill?: { contractorName?: string; contractorCnpj?: string; scope?: string; origin?: string; invitationId?: string } }) {
  const [state, action, pending] = useActionState<AnnexState, FormData>(saveContractorAnnexAction, {});
  const scopeText = prefill?.scope || record?.fields.activity || record?.fields.title || "";
  const template = useMemo(() => findContractorRiskTemplate(scopeText), [scopeText]);
  const suggestions = useMemo(() => getContractorRiskSuggestions(scopeText), [scopeText]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const getDefault = (key: keyof typeof ANNEX_FIELDS) => {
    if (record?.fields[key]) return record.fields[key];
    if (operation !== "save") return "";
    if (key === "contractor") return prefill?.contractorName || "";
    if (key === "title") return template?.title || (prefill?.scope ? `Orientação de riscos complementares – ${prefill.contractorName || "Contratada"} – ${prefill.scope}` : "Orientação de riscos complementares do PGR");
    if (key === "activity") return template?.activity || prefill?.scope || "";
    if (key === "location") return "Área indicada pela contratante para execução do serviço";
    if (key === "legalReferral") return "";
    if (key === "evidence") return template?.evidence || "Orientação de riscos complementares anexada ao PGR da contratante, vinculada ao convite de terceiros. Histórico de início e encerramento registrado.";
    if (key === "actionPlan") return template?.actionPlan || "1) Verificar área com responsável da contratante. 2) Delimitar/sinalizar local. 3) Executar com EPIs orientados. 4) Manter organização e limpeza. 5) Comunicar ao responsável ao término dos trabalhos.";
    if (key === "risks") {
      const base = template?.risks || "";
      const extra = Array.from(selected).map(id => suggestions.find(s => s.id === id)).filter(Boolean).map(s => `- ${s!.hazard}: ${s!.possibleDamage}`).join("\n");
      return [base, extra].filter(Boolean).join(base && extra ? "\n" : "");
    }
    if (key === "interference") {
      const base = template?.interference || "";
      const extra = Array.from(selected).map(id => suggestions.find(s => s.id === id)).filter(Boolean).map(s => `- ${s!.interference}`).join("\n");
      return [base, extra].filter(Boolean).join(base && extra ? "\n" : "");
    }
    if (key === "controls") {
      const base = template?.controls || "";
      const extra = Array.from(selected).map(id => suggestions.find(s => s.id === id)).filter(Boolean).map(s => `- ${s!.hazard}: ${s!.control}`).join("\n");
      const ppeExtra = Array.from(selected).map(id => suggestions.find(s => s.id === id)).filter(Boolean).map(s => `- EPIs orientados (${s!.hazard}): ${s!.ppe}`).join("\n");
      return [base, extra, ppeExtra].filter(Boolean).join(base || extra || ppeExtra ? "\n" : "");
    }
    return template?.[key as keyof typeof template] || "";
  };
  const [coverageDefault] = useState(() => record?.fields.coverage ?? (suggestions.length || template ? "not_covered" : "unknown"));
  const [contractorTypeDefault] = useState(() => record?.fields.contractorType ?? "");
  const [participantsDefault] = useState(() => record?.fields.participants ?? "unknown");
  const [startsOnDefault] = useState(() => record?.fields.startsOn ?? "");
  return <form action={action} className="pgr-form" key={`${record?.id ?? "new"}:${record?.revision ?? 0}:${operation}:${prefill?.invitationId ?? ""}`}>
    <input type="hidden" name="companyId" value={profile.companyId}/><input type="hidden" name="sha256" value={profile.sha256}/><input type="hidden" name="id" value={record?.id ?? ""}/><input type="hidden" name="revision" value={record?.revision ?? 0}/><input type="hidden" name="operation" value={operation}/>
    {prefill?.invitationId && <input type="hidden" name="invitationId" value={prefill.invitationId}/>}
    {prefill?.origin && <input type="hidden" name="origin" value={prefill.origin}/>}
    {operation === "save" ? <>
      {prefill?.scope && <div className="pgr-wide permission-note"><strong>Vinculado ao convite de terceiros</strong> · Escopo: {prefill.scope}{prefill.contractorCnpj ? ` · CNPJ: ${prefill.contractorCnpj}` : ""}</div>}
      <label className="form-field">Enquadramento informado<select name="contractorType" required defaultValue={contractorTypeDefault}><option value="" disabled>Selecione</option><option value="mei">MEI</option><option value="me">ME</option><option value="other">Outro</option></select></label>
      <label className="form-field">Quem executará o serviço?<select name="participants" defaultValue={participantsDefault}><option value="unknown">A confirmar</option><option value="owner_only">Titular sozinho</option><option value="partners_only">Somente sócios</option><option value="with_workers">Com empregados</option></select></label>
      <label className="form-field pgr-wide">Os riscos deste serviço e suas interferências estão contemplados no PGR da contratante?<select name="coverage" defaultValue={coverageDefault}><option value="unknown">Ainda não avaliado</option><option value="not_covered">Não contemplados</option><option value="covered">Sim, conforme referência registrada nas evidências</option></select></label>
      <p className="permission-note pgr-wide">Use este anexo para avaliar atividade contratada fora do processo operacional habitual da empresa cliente. A regra é geral para clientes de qualquer porte. Para MEI, a dispensa do PGR próprio não dispensa a inclusão nas ações preventivas e no PGR da contratante quando atuar nas dependências dela ou em local previamente combinado. ME não tem dispensa automática. O anexo registra os riscos e controles da tarefa no PGR da contratante, vigora durante o serviço e deve ser encerrado quando a atividade cessar, preservando o histórico. A revisão do app não libera o serviço nem substitui avaliação técnica.</p>
      {!record && suggestions.length > 0 && <div className="pgr-wide"><fieldset className="aso-exams"><legend>Sugestões de perigos para revisão da equipe</legend><p className="aso-help">Considere estas sugestões apenas se forem pertinentes à tarefa e ao local. Elas não constituem avaliação, controle aprovado ou requisito normativo.</p><div className="thirdparty-checks" style={{ flexDirection: "column", alignItems: "flex-start" }}>{suggestions.map((s) => <label key={s.id} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}><input type="checkbox" checked={selected.has(s.id)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(s.id); else next.delete(s.id); setSelected(next); }}/><span><strong>{s.hazard}</strong> · Possível dano: {s.possibleDamage}<br/><strong>Interferência:</strong> {s.interference}<br/><strong>Controle/Orientação:</strong> {s.control}<br/><strong>EPI a avaliar:</strong> {s.ppe}</span></label>)}</div></fieldset></div>}
      {Object.entries(ANNEX_FIELDS).map(([key, label]) => <label className="form-field pgr-wide" key={key}>{label === "Perigos, exposições e possíveis danos identificados pela equipe" ? "Riscos complementares identificados (pela contratante)" : label === "Interferências entre o serviço e a operação do cliente" ? "Riscos de interferência com a operação da contratante" : label === "Medidas de prevenção e responsabilidades de cada parte" ? "Medidas de controle e orientações" : label}{key === "startsOn" ? <input type="date" name={key} required defaultValue={startsOnDefault}/> : <textarea name={key} rows={key === "title" || key === "contractor" ? 2 : 5} maxLength={3000} required={["title", "contractor", "activity", "location"].includes(key)} defaultValue={getDefault(key as keyof typeof ANNEX_FIELDS)}/>}</label>)}
      {(template || suggestions.length) && !record && <p className="permission-note pgr-wide">Modelo/banco de riscos pré-preenchido com base no escopo da atividade (ferramentas manuais/elétricas, rompedores, betoneiras, escadas, andaimes). Revise, ajuste e registre o motivo antes de salvar/incluir.</p>}
    </> : operation === "close" ? <>
      <label className="form-field">Data real do término<input type="date" name="endedOn" required min={record?.fields.startsOn}/></label>
      <label className="form-field pgr-wide">Riscos e ações remanescentes, responsáveis e encaminhamentos<textarea name="remainingActions" required maxLength={3000} rows={3} placeholder="Registre o que permanece pendente ou a evidência da verificação de ausência de pendências."/></label>
      <label className="pgr-wide"><input type="checkbox" name="confirmed" value="yes" required/> Confirmo que o serviço cessou e que registrei a situação das pendências. O histórico será preservado.</label>
    </> : <label className="pgr-wide"><input type="checkbox" name="confirmed" value="yes" required/> Revisei o conteúdo e confirmo sua inclusão na prévia do PGR de trabalho. Esta ação não libera o serviço nem equivale a assinatura técnica.</label>}
    <label className="form-field pgr-wide">Motivo deste registro<textarea name="reason" required maxLength={2000} rows={2}/></label>
    {state.error && <p role="alert" className="document-warning">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    <button className="primary-button" disabled={pending}>{pending ? "Registrando…" : operation === "close" ? "Encerrar atividade e arquivar anexo" : operation === "include" ? "Registrar revisão e incluir anexo" : "Salvar anexo em rascunho"}</button>
  </form>;
}
export default function PgrContractorAnnexSection({ profile, history, canManage }: { profile: ImportedPgrProfile; history: ContractorAnnex[]; canManage: boolean }) {
  const latest = new Map<string, ContractorAnnex>();
  history.forEach(record => latest.set(record.id, record));
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const showNew = searchParams?.get("annex") === "new";
  const prefill = showNew ? {
    contractorName: searchParams.get("contractorName") || undefined,
    contractorCnpj: searchParams.get("contractorCnpj") || undefined,
    scope: searchParams.get("scope") || undefined,
    origin: searchParams.get("origin") || undefined,
    invitationId: searchParams.get("invitationId") || undefined,
  } : undefined;
  useEffect(() => {
    if (showNew && typeof document !== "undefined") {
      const el = document.querySelector("[data-annex-new]") as HTMLDetailsElement | null;
      if (el) el.open = true;
    }
  }, [showNew]);
  return <section className="panel company-detail-panel" aria-label="Anexo de riscos de atividades contratadas no PGR"><h2>Anexo de riscos de atividades contratadas no PGR</h2>
    <p>Recurso geral para todas as empresas clientes. Use para serviços de terceiros (MEI, ME e outros) cuja atividade fique fora do processo operacional habitual da contratante ou introduza perigos/interferências que precisam ser avaliados. Registre a atividade específica no PGR da contratante; confirme riscos já cobertos ou descreva o que requer integração, sem inferir pela categoria da empresa. Informe também quem executará: titular, sócios ou empregados.</p>
    <p className="document-warning">O anexo acompanha a execução da atividade, requer revisão explícita para inclusão no PGR de trabalho e deve ser encerrado quando o serviço cessar, com situação das pendências e histórico preservado. A inclusão não libera o serviço nem equivale a assinatura técnica. A dispensa do PGR próprio do MEI não se estende à contratante; ser ME também não gera dispensa automática.</p>
    {canManage && <details className="pgr-card" data-annex-new><summary>+ Criar anexo de riscos da atividade contratada</summary><Form profile={profile} prefill={prefill}/></details>}
    {[...latest.values()].map(record => <article className="pgr-card" key={record.id}><h3>{record.fields.title}</h3><p>{ANNEX_STATUS[record.status]} · revisão {record.revision}</p>
      {(record as any).invitationId && <p className="permission-note">Vinculado ao convite de terceiros: {(record as any).invitationId}{(record as any).contractorName ? ` · ${(record as any).contractorName}` : ""}{(record as any).contractorCnpj ? ` · ${(record as any).contractorCnpj}` : ""}</p>}
      {record.status === "draft" && needsContractorRiskReview(record.fields.coverage) && <p role="status" className="document-warning">Avaliar e orientar os riscos complementares desta atividade. A avaliação ainda depende da equipe.</p>}
      <p>Anexo: {record.id} · início informado: {record.fields.startsOn}</p><AnnexContent record={record}/>
      {record.closure && <p>Serviço encerrado em {record.closure.endedOn}. Pendências / encaminhamentos: {record.closure.remainingActions}</p>}
      {canManage && record.status !== "closed" && <>
        <details><summary>Editar anexo · exige nova revisão para inclusão</summary><Form profile={profile} record={record}/></details>
        {record.status === "draft" && <details><summary>Revisar e incluir no PGR de trabalho</summary><Form profile={profile} record={record} operation="include"/></details>}
        <details><summary>Confirmar término do serviço (vigência até o término)</summary><Form profile={profile} record={record} operation="close"/></details>
      </>}
      <details><summary>Histórico preservado · {history.filter(entry => entry.id === record.id).length} versões</summary>{history.filter(entry => entry.id === record.id).map(entry => <section key={entry.revision}><h4>Revisão {entry.revision} · {ANNEX_STATUS[entry.status]}</h4><p>{new Date(entry.recordedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · conta: {entry.actorUserId} · motivo: {entry.reason}</p><AnnexContent record={entry}/>{entry.closure && <p>Término: {entry.closure.endedOn} · encaminhamentos: {entry.closure.remainingActions}</p>}</section>)}</details>
    </article>)}
    {!latest.size && <p>Nenhum anexo de riscos de atividade contratada registrado neste PGR.</p>}
  </section>;
}
