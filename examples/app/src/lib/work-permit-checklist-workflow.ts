// Contrato candidato puro. Não emite documento nem concede autoridade no runtime.
export type PermitRole = "leader" | "supervisor" | "tst" | "participant";
export type PermitScope = { tenantId: string; companyId: string; unitId: string; activityId: string };
export type PermitActor = PermitScope & { userId: string; role: PermitRole };
export type PermitAnswer = { id: string; prompt: string; result: "conforming" | "nc" | "not_applicable"; note: string };
export type PermitReview = { id: string; verdict: "corrected" | "nc_remains"; evidence: string };
export type PermitSignature = { userId: string; statement: string; occurredAt: string };
export type PermitChecklist = PermitScope & {
  hasTst: boolean;
  revision: number;
  status: "draft" | "awaiting_tst" | "supervisor_decision" | "awaiting_correction" | "release_recorded" | "continuation_with_nc_recorded";
  answers: PermitAnswer[];
  reviews: PermitReview[];
  signatures: PermitSignature[];
  history: Array<{ revision: number; action: string; actorUserId: string; actorRole: PermitRole; occurredAt: string; note: string; answers: PermitAnswer[]; reviews: PermitReview[]; signatures: PermitSignature[] }>;
};
export class PermitWorkflowError extends Error {}
function required(value: string, max = 2000) { return typeof value === "string" && !!value.trim() && value.length <= max; }
function sameScope(scope: PermitScope, actor: PermitActor) {
  return ["tenantId", "companyId", "unitId", "activityId"].every(key => scope[key as keyof PermitScope] === actor[key as keyof PermitScope]);
}
export function createPermitChecklistCandidate(scope: PermitScope, hasTst: boolean): PermitChecklist {
  if (Object.values(scope).some(value => !required(value, 140)) || typeof hasTst !== "boolean") throw new PermitWorkflowError("Escopo e disponibilidade de TST precisam ser definidos.");
  return { ...scope, hasTst, revision: 1, status: "draft", answers: [], reviews: [], signatures: [], history: [] };
}
export function openPermitNc(checklist: PermitChecklist): PermitAnswer[] {
  return checklist.answers.filter(answer => answer.result === "nc" && !checklist.reviews.some(review => review.id === answer.id && review.verdict === "corrected"));
}
type Command =
  | { action: "submit"; answers: PermitAnswer[] }
  | { action: "review"; reviews: PermitReview[]; note: string }
  | { action: "await_correction"; note: string }
  | { action: "resubmit_correction"; note: string }
  | { action: "release"; note: string }
  | { action: "continue_with_nc"; note: string }
  | { action: "sign_participation"; statement: string };
export function transitionPermitChecklist(source: PermitChecklist, actor: PermitActor, expectedRevision: number, command: Command): PermitChecklist {
  if (!sameScope(source, actor) || !required(actor.userId, 140)) throw new PermitWorkflowError("Ator fora do escopo informado para a atividade.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== source.revision) throw new PermitWorkflowError("O checklist mudou. Atualize a revisão.");
  const next = structuredClone(source);
  const supervisor = actor.role === "supervisor";
  const fieldLeader = supervisor || actor.role === "leader";
  let note = "";
  switch (command.action) {
    case "submit": {
      if (!fieldLeader || next.status !== "draft") throw new PermitWorkflowError("Somente líder/supervisor pode enviar o preenchimento inicial.");
      if (!command.answers.length || command.answers.length > 50 || new Set(command.answers.map(answer => answer.id)).size !== command.answers.length
        || command.answers.some(answer => !required(answer.id, 64) || !required(answer.prompt, 300)
          || !["conforming", "nc", "not_applicable"].includes(answer.result)
          || typeof answer.note !== "string" || answer.note.length > 2000 || (answer.result !== "conforming" && !answer.note.trim()))) {
        throw new PermitWorkflowError("Preencha de 1 a 50 itens. NC e não aplicável exigem justificativa.");
      }
      next.answers = structuredClone(command.answers);
      next.status = openPermitNc(next).length && next.hasTst ? "awaiting_tst" : "supervisor_decision";
      note = "Preenchimento registrado; não é liberação.";
      break;
    }
    case "review": {
      const allowed = next.hasTst ? actor.role === "tst" && next.status === "awaiting_tst" : supervisor && next.status === "supervisor_decision";
      if (!allowed || !required(command.note)) throw new PermitWorkflowError("Reavaliação indisponível para este ator/etapa.");
      const ncIds = next.answers.filter(answer => answer.result === "nc").map(answer => answer.id);
      if (!ncIds.length || command.reviews.length !== ncIds.length || new Set(command.reviews.map(review => review.id)).size !== ncIds.length
        || command.reviews.some(review => !ncIds.includes(review.id) || !["corrected", "nc_remains"].includes(review.verdict) || !required(review.evidence))) {
        throw new PermitWorkflowError("Reavalie todos os itens NC com evidência e conclusão explícitas.");
      }
      next.reviews = structuredClone(command.reviews);
      next.status = "supervisor_decision";
      note = command.note;
      break;
    }
    case "await_correction":
      if (!supervisor || next.status !== "supervisor_decision" || !openPermitNc(next).length || !required(command.note)) throw new PermitWorkflowError("Somente supervisor pode devolver NC para adequação nesta etapa.");
      next.status = "awaiting_correction";
      note = command.note;
      break;
    case "resubmit_correction":
      if (!supervisor || next.status !== "awaiting_correction" || !required(command.note)) throw new PermitWorkflowError("Registre a adequação antes de solicitar reavaliação.");
      // Relatar adequação não resolve automaticamente as NC nem apaga a revisão anterior.
      next.status = next.hasTst ? "awaiting_tst" : "supervisor_decision";
      note = command.note;
      break;
    case "release":
      if (!fieldLeader || next.status !== "supervisor_decision" || openPermitNc(next).length || !required(command.note)) throw new PermitWorkflowError("Liberação sem pendência exige todos os itens NC reavaliados como corrigidos.");
      next.status = "release_recorded";
      note = command.note;
      break;
    case "continue_with_nc":
      if (!supervisor || next.status !== "supervisor_decision" || !openPermitNc(next).length || !required(command.note)) throw new PermitWorkflowError("Somente supervisor registra a decisão de prosseguir com NC após a etapa de reavaliação aplicável.");
      next.status = "continuation_with_nc_recorded";
      note = command.note;
      break;
    case "sign_participation": {
      const decided = next.status === "release_recorded" || next.status === "continuation_with_nc_recorded";
      if (actor.role !== "participant" || !decided || !required(command.statement, 500)) {
        throw new PermitWorkflowError("Integrante só registra a própria participação depois da decisão de campo. Isso não libera a atividade.");
      }
      if (next.signatures.some(signature => signature.userId === actor.userId)) {
        throw new PermitWorkflowError("Esta conta fictícia de integrante já registrou a participação.");
      }
      next.signatures.push({ userId: actor.userId, statement: command.statement.trim(), occurredAt: new Date().toISOString() });
      note = command.statement.trim();
      break;
    }
    default: throw new PermitWorkflowError("Ação desconhecida.");
  }
  next.revision++;
  next.history.push({ revision: next.revision, action: command.action, actorUserId: actor.userId, actorRole: actor.role, occurredAt: new Date().toISOString(), note,
    answers: structuredClone(next.answers), reviews: structuredClone(next.reviews), signatures: structuredClone(next.signatures) });
  return next;
}
