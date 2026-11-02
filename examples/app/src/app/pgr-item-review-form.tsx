"use client";
import { useActionState } from "react";
import { savePgrItemReviewAction, type ItemReviewState } from "./pgr-item-review-actions";
import type { PgrItemReview } from "@/lib/pgr-item-review-store";
export default function PgrItemReviewForm({ companyId, sha256, itemKey, history, canReview }: { companyId: string; sha256: string; itemKey: string; history: PgrItemReview[]; canReview: boolean }) {
  const [state, action, pending] = useActionState<ItemReviewState, FormData>(savePgrItemReviewAction, {});
  const entries = state.entry && !history.some(entry => entry.revision === state.entry?.revision)
    ? [...history, state.entry] : history;
  const current = entries.at(-1);
  const labels = { checked: "Conferido", adjustment: "Ajuste necessário", pending: "Pendente" };
  return <details><summary>Registrar conferência · {current ? labels[current.status] : "Não revisado"}</summary>
    <p>Registra a conferência deste item e as correções propostas. Não altera o PDF ou aprova o PGR. Campos ausentes e apontamentos automáticos permanecem visíveis, mesmo quando o item é marcado como conferido.</p>
    {canReview && <form action={action} className="pgr-form">
      <input type="hidden" name="companyId" value={companyId}/><input type="hidden" name="sha256" value={sha256}/><input type="hidden" name="itemKey" value={itemKey}/><input type="hidden" name="revision" value={current?.revision ?? 0}/>
      <label className="form-field">Situação<select name="status" defaultValue={current?.status ?? "pending"}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="form-field pgr-wide">Observações e ajustes propostos<textarea name="note" defaultValue={current?.note ?? ""} maxLength={3000} rows={4}/></label>
      <button className="primary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar conferência"}</button>
    </form>}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    {current && <p>Último registro: {labels[current.status]} · {new Date(current.savedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · revisão {current.revision}<br/>{current.note}</p>}
    {entries.length > 0 && <details><summary>Histórico preservado · {entries.length}</summary><ul>{entries.map(entry => <li key={entry.revision}>Revisão {entry.revision} · {labels[entry.status]} · {new Date(entry.savedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<p>Conta que registrou: {entry.actorUserId}. Este registro não comprova habilitação profissional ou assinatura.</p><p style={{ whiteSpace: "pre-wrap" }}>{entry.note}</p></li>)}</ul></details>}
  </details>;
}
