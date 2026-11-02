import type { SafetyAprRevision } from "@/lib/safety-operations-store";
import { compareAprRevisions, APR_COMPARISON_FIELDS } from "@/lib/apr-revision-comparison";

const actionLabels: Record<SafetyAprRevision["action"], string> = {
  created: "Rascunho criado", saved: "Respostas salvas", submitted: "Enviada para revisão humana", legacy_snapshot: "Estado legado preservado",
};
const resultLabels = { unanswered: "Sem resposta", observed: "Condição observada", attention: "Ponto a tratar", not_applicable: "Não aplicável" };
function recordedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não registrada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date) + " (Brasília)";
}
function Comparison({ before, after }: { before: SafetyAprRevision; after: SafetyAprRevision }) {
  const comparison = compareAprRevisions(before, after);
  if (!comparison.available) return <p className="permission-note">{comparison.reason}</p>;
  function display(value: string | null, field: string) {
    if (value === null) return "Item ausente nesta revisão";
    if (!value) return "Não informado";
    return field === "result" ? resultLabels[value as keyof typeof resultLabels] ?? value : value;
  }
  return <details className="issue-history"><summary>Comparar revisões {before.revision} → {after.revision} · {comparison.items.length} item(ns) alterado(s)</summary>
    <p>Somente leitura dos dois registros disponíveis. Mudança de resposta não comprova adequação técnica ou conformidade.</p>
    {after.revision > before.revision + 1 && <p className="permission-note">Não há reconstrução das revisões intermediárias ausentes.</p>}
    {comparison.statusChanged && <p>Estado da APR: <strong>{before.status === "draft" ? "Rascunho" : "Em revisão"}</strong> → <strong>{after.status === "draft" ? "Rascunho" : "Em revisão"}</strong>.</p>}
    {!comparison.items.length && <p>Nenhuma mudança nas respostas entre estas revisões.</p>}
    {comparison.items.map(item => <section key={item.id}><h4>{item.prompt} · {item.kind === "added" ? "Item acrescentado" : item.kind === "removed" ? "Item ausente na revisão seguinte" : "Item alterado"}</h4>
      {item.changes.map(change => <div key={change.field}><p><strong>{APR_COMPARISON_FIELDS[change.field]}</strong></p><p>Revisão {before.revision}: {display(change.before, change.field)}</p><p>Revisão {after.revision}: {display(change.after, change.field)}</p></div>)}
    </section>)}
  </details>;
}
export default function AprRevisionHistory({ history }: { history?: SafetyAprRevision[] }) {
  if (!history?.length) return <details className="issue-history"><summary>Histórico de revisões · não disponível</summary><p className="permission-note">Esta APR não possui histórico de revisões registrado. As respostas atuais continuam disponíveis; versões anteriores e suas autorias não são reconstruídas.</p></details>;
  const partial = history[0].action === "legacy_snapshot" || history[0].revision > 1;
  const entries = history.map((entry, index) => ({ entry, previous: index > 0 ? history[index - 1] : undefined })).reverse();
  return <details className="issue-history"><summary>Histórico de revisões · {history.length} registro(s)</summary>
    <p>Consulta das respostas gravadas em cada revisão, da mais recente para a mais antiga. O envio para revisão não é aprovação nem liberação de trabalho.</p>
    {partial && <p className="permission-note">Histórico disponível a partir da revisão {history[0].revision}. O primeiro registro preserva apenas o estado legado conhecido; alterações anteriores não foram reconstruídas.</p>}
    {entries.map(({ entry, previous }) => <details className="issue-history" key={entry.revision}>
      <summary>Revisão {entry.revision} · {actionLabels[entry.action] ?? "Registro histórico"} · {entry.status === "in_review" ? "Em revisão" : "Rascunho"}</summary>
      <p>{recordedDate(entry.occurredAt)}</p>
      <p>{entry.actorUserId ? <>Conta que registrou: <strong>{entry.actorUserId}</strong></> : "Conta não registrada para este estado legado."}</p>
      {previous && <Comparison before={previous} after={entry}/>}
      <ol>{entry.answers.map(answer => <li key={answer.id}><strong>{answer.prompt}</strong> · {resultLabels[answer.result] ?? "Resultado não reconhecido"}
        {answer.notes && <p>Observação/justificativa: {answer.notes}</p>}
        {answer.nextStep && <p>Próximo passo: {answer.nextStep}</p>}
        {answer.responsible && <p>Responsável informado: {answer.responsible}</p>}
      </li>)}</ol>
    </details>)}
  </details>;
}
