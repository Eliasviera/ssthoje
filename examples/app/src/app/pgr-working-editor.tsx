"use client";
import { useActionState, useEffect, useState } from "react";
import { saveWorkingAction, type WorkingState } from "./pgr-working-actions";
import type { WorkingEntry, WorkingFields, WorkingKind } from "@/lib/pgr-working-store";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import { emptyWorkingFields as empty, workingDocumentItems, workingFieldLabels } from "@/lib/pgr-working-document";
import PgrWorkingDocument from "./pgr-working-document";
import type { ContractorAnnex } from "@/lib/pgr-contractor-annex";
function Editor({ profile, kind, id = "", initial = empty, history = [], canManage }: { profile: ImportedPgrProfile; kind: WorkingKind; id?: string; initial?: WorkingFields; history?: WorkingEntry[]; canManage: boolean }) {
  const [state, action, pending] = useActionState<WorkingState, FormData>(saveWorkingAction, {});
  const current = history.at(-1), fields = current?.fields ?? initial;
  return <details className="pgr-card"><summary>{id ? fields.name : kind === "risk" ? "+ Adicionar risco identificado" : kind === "action" ? "+ Adicionar ação" : "+ Adicionar função"}{id && <small> · {id.includes("new-") ? "Incluído na revisão" : current ? "Alterado na revisão" : "Extraído do PGR"}</small>}</summary>
    {canManage ? <form action={action} className="pgr-form" key={`${id}:${current?.revision ?? 0}`}>
      <input type="hidden" name="companyId" value={profile.companyId}/><input type="hidden" name="sha256" value={profile.sha256}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={current?.revision ?? 0}/>
      {Object.entries(workingFieldLabels(kind)).map(([key, label]) => <label className="form-field" key={key}>{label}<textarea name={key} defaultValue={fields[key as keyof WorkingFields] ?? ""} required={key === "name" || key === "evidence"} maxLength={3000} rows={key === "name" || key === "sector" ? 2 : 3}/></label>)}
      <label className="form-field pgr-wide">Motivo da inclusão ou alteração<textarea name="reason" required maxLength={2000} rows={3}/></label>
      <button className="primary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar no PGR de trabalho"}</button>
    </form> : <dl>{Object.entries(fields).map(([key, value]) => <div key={key}><dt>{workingFieldLabels(kind)[key as keyof WorkingFields]}</dt><dd>{value || "Não informado"}</dd></div>)}</dl>}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    {history.length > 0 && <details><summary>Histórico das alterações · {history.length}</summary>{history.map(entry => <article key={entry.revision}><h4>Revisão {entry.revision} · {new Date(entry.savedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</h4><p>Registrada por: {entry.actorUserId} · Motivo: {entry.reason}</p><dl>{Object.entries(entry.fields).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{workingFieldLabels(kind)[key as keyof WorkingFields] ?? key}</dt><dd>{value}</dd></div>)}</dl></article>)}</details>}
  </details>;
}
export default function PgrWorkingEditor({ profile, history, canManage, annexes = [], reviewerName = "" }: { profile: ImportedPgrProfile; history: WorkingEntry[]; canManage: boolean; annexes?: ContractorAnnex[]; reviewerName?: string }) {
  const [kind, setKind] = useState<WorkingKind>("risk"), [query, setQuery] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const requestPrint = () => document.getElementById("pgr-print-updated-button")?.click();
    const showPreview = () => {
      setPreview(true);
      window.requestAnimationFrame(() => document.getElementById("pgr-updated-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("sst:print-updated-pgr", requestPrint);
    window.addEventListener("sst:preview-updated-pgr", showPreview);
    return () => {
      window.removeEventListener("sst:print-updated-pgr", requestPrint);
      window.removeEventListener("sst:preview-updated-pgr", showPreview);
    };
  }, []);
  const items = workingDocumentItems(profile, history, kind).filter(item => Object.values(item.fields).join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className="panel company-detail-panel"><h2>PGR editável · documento de trabalho</h2><div className="client-card-actions"><button className="secondary-button" aria-pressed={!preview} onClick={() => setPreview(false)}>Editar conteúdo do PGR</button><button className="secondary-button" aria-pressed={preview} onClick={() => setPreview(true)}>Prévia do PGR com minha logo</button></div><PgrWorkingDocument profile={profile} history={history} annexes={annexes} initialReviewerName={reviewerName} hidden={!preview}/>{preview ? null : <><p>Edite funções, riscos e o plano de ação ou inclua novos itens. As alterações ficam em rascunho, vinculadas a esta versão do PGR, com motivo, evidência e histórico. O PDF e a transcrição original permanecem disponíveis abaixo. Estas alterações ainda não alimentam automaticamente análises de terceiros ou o inventário estruturado.</p>
    <div className="client-card-actions"><button className="secondary-button" aria-pressed={kind === "risk"} onClick={() => setKind("risk")}>Riscos</button><button className="secondary-button" aria-pressed={kind === "role"} onClick={() => setKind("role")}>Funções</button><button className="secondary-button" aria-pressed={kind === "action"} onClick={() => setKind("action")}>Editar plano de ação</button></div>
    <label className="form-field">Buscar no inventário de trabalho<input type="search" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {canManage && <Editor key={`new-${kind}`} profile={profile} kind={kind} canManage/>}
    <p role="status">{items.length} itens encontrados · pendentes de revisão técnica</p>
    {items.map(item => <Editor key={item.id} profile={profile} kind={kind} id={item.id} initial={item.fields} history={history.filter(entry => entry.id === item.id)} canManage={canManage}/>)}
  </>}</section>;
}

