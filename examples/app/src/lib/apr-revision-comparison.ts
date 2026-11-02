import type { AprChecklistAnswer, SafetyAprRevision } from "./safety-operations-store";

export const APR_COMPARISON_FIELDS = {
  prompt: "Pergunta", result: "Resultado", notes: "Observação/justificativa", nextStep: "Próximo passo", responsible: "Responsável informado",
} as const;
export type AprComparisonField = keyof typeof APR_COMPARISON_FIELDS;
type Change = { field: AprComparisonField; before: string | null; after: string | null };
type ItemDifference = { id: string; prompt: string; kind: "added" | "removed" | "changed"; changes: Change[] };
export type AprRevisionComparison = { available: false; reason: string } | {
  available: true; fromRevision: number; toRevision: number; statusChanged: boolean; items: ItemDifference[];
};
const fields = Object.keys(APR_COMPARISON_FIELDS) as AprComparisonField[];
function validAnswers(answers: AprChecklistAnswer[]) {
  return Array.isArray(answers) && answers.every(answer => answer && typeof answer.id === "string" && !!answer.id.trim()
    && fields.every(field => typeof answer[field] === "string")) && new Set(answers.map(answer => answer.id)).size === answers.length;
}
/** Compara apenas os registros fornecidos; não reconstrói revisões intermediárias. */
export function compareAprRevisions(before: SafetyAprRevision, after: SafetyAprRevision): AprRevisionComparison {
  if (!Number.isSafeInteger(before.revision) || !Number.isSafeInteger(after.revision)
    || before.revision < 1 || before.revision >= after.revision || !validAnswers(before.answers) || !validAnswers(after.answers)) {
    return { available: false, reason: "Comparação indisponível: confira a sequência das revisões e os identificadores das respostas." };
  }
  const prior = new Map(before.answers.map(answer => [answer.id, answer]));
  const current = new Map(after.answers.map(answer => [answer.id, answer]));
  const items: ItemDifference[] = [];
  for (const answer of before.answers) {
    const next = current.get(answer.id);
    const changes = fields.filter(field => !next || answer[field] !== next[field])
      .map(field => ({ field, before: answer[field], after: next ? next[field] : null }));
    if (changes.length) items.push({ id: answer.id, prompt: next?.prompt ?? answer.prompt, kind: next ? "changed" : "removed", changes });
  }
  for (const answer of after.answers) {
    if (!prior.has(answer.id)) items.push({ id: answer.id, prompt: answer.prompt, kind: "added",
      changes: fields.map(field => ({ field, before: null, after: answer[field] })) });
  }
  return { available: true, fromRevision: before.revision, toRevision: after.revision, statusChanged: before.status !== after.status, items };
}
