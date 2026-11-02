"use client";

import { correctionPeriodLabel } from "@/lib/correction-period";

import { useActionState, useState } from "react";
import type { InvitationSummary, ThirdPartyIssue } from "@/lib/third-party-store";
import type { ComplianceEvaluation } from "@/lib/compliance-store";
import { openIssueAction, updateIssueAction } from "./third-party-actions";

export type IssueReviewer = { userId: string; displayName: string };
const statusLabels = { open: "Aguardando correção", awaiting_review: "Aguardando reavaliação", resolved: "Resolvida internamente" };
const eventLabels = { opened: "Pendência aberta", assigned: "Responsável alterado", commented: "Comentário interno", resent: "PDF corrigido recebido", reopened: "Nova correção solicitada", resolved: "Reavaliação encerrada" };
function Responsible({ reviewers, value }: { reviewers: IssueReviewer[]; value?: string }) {
  return <label className="form-field">Responsável pela reavaliação<select name="assigneeUserId" required defaultValue={value ?? ""}><option value="" disabled>Selecione</option>{reviewers.map(r => <option key={r.userId} value={r.userId}>{r.displayName}</option>)}</select></label>;
}
function Message({ state }: { state: { error?: string; success?: string } }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}
function NewIssue({ invite, reviewers }: { invite: InvitationSummary; reviewers: IssueReviewer[] }) {
  const [state, action, pending] = useActionState(async (_previous: object, data: FormData) => openIssueAction(data), {});
  const latest = invite.receipts.filter(r => invite.receipts.filter(v => v.kind === r.kind).at(-1)?.id === r.id && !(invite.issues ?? []).some(i => i.kind === r.kind && i.status !== "resolved"));
  if (!latest.length) return null;
  return <details className="aso-new"><summary>Abrir pendência · {invite.contractorName}</summary><form action={action} className="pgr-form"><input type="hidden" name="invitationId" value={invite.id}/>
    <label className="form-field">PDF recebido<select name="receiptId" required defaultValue=""><option value="" disabled>Selecione</option>{latest.map(r => <option key={r.id} value={r.id}>{r.kind} · {r.fileName} · {r.id.slice(0, 8)}</option>)}</select></label>
    <Responsible reviewers={reviewers}/><label className="form-field pgr-wide">Motivo visível à contratada<textarea name="reason" required maxLength={600}/></label><label className="form-field pgr-wide">Correção solicitada visível à contratada<textarea name="requestedChange" required maxLength={1200}/></label><label className="form-field pgr-wide">Evidência interna · referência ao PDF ou página<textarea name="evidence" required maxLength={1200}/></label>
    <div className="pgr-form-footer"><p>Prazo interno: 3 dias corridos a partir da data da solicitação em Brasília; uma nova correção reinicia o prazo e preserva o anterior. Motivo, correção e prazo aparecem no portal. Evidência interna e responsável ficam restritos à equipe.</p><button className="primary-button" disabled={pending}>{pending ? "Registrando…" : "Registrar pendência"}</button></div>
  </form><Message state={state}/></details>;
}
function IssueUpdate({ invite, issue, reviewers, currentUserId }: { invite: InvitationSummary; issue: ThirdPartyIssue; reviewers: IssueReviewer[]; currentUserId: string }) {
  const [operation, setOperation] = useState("comment");
  const [state, action, pending] = useActionState(async (_previous: object, data: FormData) => updateIssueAction(data), {});
  const mayReview = issue.status === "awaiting_review" && issue.assigneeUserId === currentUserId;
  const selectedOperation = !mayReview && ["resolve", "reopen"].includes(operation) ? "comment" : operation;
  return <form action={action} className="pgr-form" key={issue.revision}><input type="hidden" name="invitationId" value={invite.id}/><input type="hidden" name="issueId" value={issue.id}/><input type="hidden" name="revision" value={issue.revision}/>
    <label className="form-field">Ação na pendência<select name="operation" value={selectedOperation} onChange={e => setOperation(e.target.value)}><option value="comment">Comentar internamente</option><option value="assign">Alterar responsável</option>{mayReview && <><option value="resolve">Resolver após reavaliar</option><option value="reopen">Solicitar nova correção</option></>}</select></label>
    {selectedOperation === "assign" && <Responsible reviewers={reviewers} value={issue.assigneeUserId}/>}
    <label className="form-field pgr-wide">{selectedOperation === "reopen" ? "Novo motivo visível à contratada" : "Comentário ou justificativa interna"}<textarea name="notes" required maxLength={selectedOperation === "reopen" ? 600 : 1200}/></label>
    {(selectedOperation === "resolve" || selectedOperation === "reopen") && <label className="form-field pgr-wide">Evidência interna da reavaliação<textarea name="evidence" required maxLength={1200}/></label>}
    {selectedOperation === "reopen" && <p>Nova correção: outro prazo interno de 3 dias corridos começa na data desta solicitação em Brasília. O prazo anterior permanece no histórico.</p>}
    {selectedOperation === "reopen" && <label className="form-field pgr-wide">Nova correção solicitada visível à contratada<textarea name="requestedChange" required maxLength={1200}/></label>}
    <div className="pgr-form-footer"><p>A revisão será vinculada ao protocolo atual. Resolver encerra esta pendência interna; não aprova conformidade.</p><button className="primary-button" disabled={pending}>{pending ? "Salvando…" : "Registrar atualização"}</button></div><Message state={state}/>
  </form>;
}
export default function IssueSection({ invitations, reviewers, currentUserId, evaluations, onOpenDocuments, onOpenThirdParty }: { invitations: InvitationSummary[]; reviewers: IssueReviewer[]; currentUserId: string; evaluations: ComplianceEvaluation[]; onOpenDocuments: () => void; onOpenThirdParty: () => void }) {
  const [filter, setFilter] = useState("active");
  const issues = invitations.flatMap(invite => (invite.issues ?? []).map(issue => ({ invite, issue })));
  const shown = issues.filter(({ issue }) => filter === "all" || (filter === "mine" ? issue.assigneeUserId === currentUserId && issue.status !== "resolved" : issue.status !== "resolved"));
  // Somente o último resultado por documento e critério permanece operacional; o histórico M07 não é apagado.
  const latestEvaluations = evaluations.filter(e => !evaluations.some(other => other.documentId === e.documentId && other.ruleId === e.ruleId && other.evaluatedAt > e.evaluatedAt));
  const legacyPending = latestEvaluations.filter(e => e.result === "pendente" || e.result === "inconclusivo");
  return <section className="panel pgr-section issue-section" aria-labelledby="issues-title"><div className="panel-heading"><div><h2 id="issues-title">Correção e reavaliação</h2><p>Atribua responsáveis e preserve as evidências de cada recebimento.</p></div><span className="period-label">{issues.filter(x => x.issue.status !== "resolved").length} ativas</span></div>
    <div className="document-warning">Somente documentos fictícios não clínicos. Nenhum prazo legal é presumido. Reavaliação interna não substitui aprovação profissional.</div>
    <h3>Nova pendência de terceiro</h3><p>Abra uma pendência para um PDF recebido. Para receber documentos ou renovar o link, use Terceiros.</p><button className="secondary-button" onClick={onOpenThirdParty}>Abrir Terceiros</button>
    {invitations.some(i => i.receipts.length) ? invitations.map(invite => <NewIssue key={invite.id} invite={invite} reviewers={reviewers}/>) : <p className="permission-note">Nenhum PDF de terceiro recebido nesta consultoria.</p>}
    <div className="issue-filter"><h3>Acompanhamento</h3><label className="form-field">Exibir pendências<select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Ativas</option><option value="mine">Minhas ativas</option><option value="all">Todas, incluindo resolvidas</option></select></label></div>
    {!shown.length && <p className="permission-note">Nenhuma pendência neste filtro.</p>}
    {shown.map(({ invite, issue }) => <article className="pgr-card issue-card" key={issue.id}><header><div><h3>{issue.kind} · {invite.contractorName}</h3><p>{invite.companyName} · {invite.unitName}</p></div><span className="period-label">{statusLabels[issue.status]}</span></header><p><strong>Responsável:</strong> {reviewers.find(r => r.userId === issue.assigneeUserId)?.displayName ?? "Membro indisponível"}</p><p><strong>Motivo:</strong> {issue.reason}</p><p><strong>Correção solicitada:</strong> {issue.requestedChange}</p><p>{correctionPeriodLabel(issue.correctionPeriod)}</p><p>Protocolo atual: {issue.currentReceiptId}</p><a className="secondary-button" href={`/api/third-party-files/${issue.currentReceiptId}`}>Baixar PDF para reavaliar</a>
      <details className="issue-history"><summary>Histórico e evidências · {issue.events.length} registros</summary><ol>{issue.events.map(e => <li key={e.id}><strong>{eventLabels[e.type]}</strong><p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(e.occurredAt))} · {e.actorUserId.startsWith("invite:") ? "Envio pelo convite" : reviewers.find(r => r.userId === e.actorUserId)?.displayName ?? "Membro fictício"}</p><p>{e.notes}</p>{e.correctionPeriod && <p>{correctionPeriodLabel(e.correctionPeriod)}</p>}{e.requestedChange && <p>Correção solicitada neste registro: {e.requestedChange}</p>}{e.assigneeUserId && <p>Responsável neste registro: {reviewers.find(r => r.userId === e.assigneeUserId)?.displayName ?? "Membro fictício"}</p>}{e.evidence && <p>Evidência: {e.evidence}</p>}<p>Protocolo: {e.receiptId}</p><a href={`/api/third-party-files/${e.receiptId}`}>Baixar esta versão</a></li>)}</ol></details>
      {issue.status !== "resolved" && <IssueUpdate invite={invite} issue={issue} reviewers={reviewers} currentUserId={currentUserId}/>}
    </article>)}
    {legacyPending.length > 0 && <div className="permission-note"><h3>Avaliações de documentos do cliente · {legacyPending.length} pendentes ou inconclusivas</h3>{legacyPending.map(e => <p key={e.id}>{e.documentTitle} · versão {e.documentVersion} · {e.ruleTitle}: {e.nextStep || e.notes}</p>)}<button className="secondary-button" onClick={onOpenDocuments}>Corrigir ou reavaliar em Documentos</button><p>Os documentos do cliente mantêm o fluxo de versões e checklist do M06/M07.</p></div>}
  </section>;
}
