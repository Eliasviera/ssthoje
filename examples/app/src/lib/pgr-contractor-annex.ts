export const ANNEX_FIELDS = {
  title: "Título do anexo", contractor: "Contratada / identificação empresarial",
  activity: "Serviço contratado", location: "Local e área afetada", startsOn: "Início informado",
  risks: "Perigos, exposições e possíveis danos identificados pela equipe",
  interference: "Interferências entre o serviço e a operação do cliente",
  controls: "Medidas de prevenção e responsabilidades de cada parte",
  actionPlan: "Ações, responsáveis, prazos e acompanhamento",
  evidence: "Referências dos documentos e evidências da avaliação",
  legalReferral: "Encaminhamento ao jurídico / referência de documento restrito (opcional)",
} as const;
export type AnnexFields = Record<keyof typeof ANNEX_FIELDS, string> & {
  contractorType: "mei" | "me" | "other";
  participants: "owner_only" | "partners_only" | "with_workers" | "unknown";
  coverage: "covered" | "not_covered" | "unknown";
};
export type AnnexScope = { tenantId: string; companyId: string; unitId: string; sha256: string };
export type ContractorAnnex = {
  id: string; scope: AnnexScope; revision: number; status: "draft" | "included" | "closed";
  fields: AnnexFields; actorUserId: string; recordedAt: string; reason: string;
  closure?: { endedOn: string; remainingActions: string };
  // Vínculo opcional com o convite de terceiros que originou o anexo.
  invitationId?: string; contractorName?: string; contractorCnpj?: string;
};
export const ANNEX_STATUS = { draft: "Rascunho · avaliação pendente", included: "Incluído no PGR de trabalho", closed: "Encerrado · histórico preservado" } as const;
export function needsContractorRiskReview(coverage: AnnexFields["coverage"]) { return coverage !== "covered"; }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
export function nextContractorAnnex(current: ContractorAnnex | undefined, input: {
  id: string; scope: AnnexScope; expectedRevision: number; operation: "save" | "include" | "close";
  fields?: AnnexFields; actorUserId: string; recordedAt: string; reason: string;
  confirmed?: boolean; endedOn?: string; remainingActions?: string;
}): ContractorAnnex {
  if (!input.actorUserId || !input.reason.trim() || input.reason.length > 2000) throw new Error("Informe o motivo do registro (até 2.000 caracteres).");
  if (!Number.isSafeInteger(input.expectedRevision) || (current?.revision ?? 0) !== input.expectedRevision) throw new Error("O anexo mudou. Atualize a página antes de salvar.");
  if (current && (current.id !== input.id || Object.keys(input.scope).some(key => current.scope[key as keyof AnnexScope] !== input.scope[key as keyof AnnexScope]))) throw new Error("Anexo indisponível neste PGR.");
  if (current?.status === "closed") throw new Error("Anexo encerrado é somente leitura. Registre nova atividade em novo anexo.");
  const fields = input.operation === "save" ? input.fields : current?.fields;
  if (!fields || !Object.keys(ANNEX_FIELDS).every(key => typeof fields[key as keyof typeof ANNEX_FIELDS] === "string" && fields[key as keyof typeof ANNEX_FIELDS].length <= 3000)
    || ![fields.title, fields.contractor, fields.activity, fields.location].every(value => value.trim())
    || !["mei", "me", "other"].includes(fields.contractorType) || !["owner_only", "partners_only", "with_workers", "unknown"].includes(fields.participants)
    || !["covered", "not_covered", "unknown"].includes(fields.coverage) || !validDate(fields.startsOn)) throw new Error("Preencha identificação, serviço, local, início válido e opções do anexo. Limite: 3.000 caracteres por campo.");
  if (input.operation !== "save" && !input.confirmed) throw new Error("Confirme explicitamente a revisão ou o encerramento.");
  if (input.operation === "include" && (!current || ![fields.risks, fields.interference, fields.controls, fields.actionPlan, fields.evidence].every(value => value.trim()) || fields.participants === "unknown" || fields.coverage === "unknown")) throw new Error("Complete riscos, interferências, medidas, plano, evidências, participantes e a avaliação de cobertura antes de incluir o anexo.");
  if (input.operation === "close" && (!current || !input.endedOn || !validDate(input.endedOn) || input.endedOn < fields.startsOn
    || input.endedOn > new Date(input.recordedAt).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    || !input.remainingActions?.trim() || input.remainingActions.length > 3000)) throw new Error("Informe a data real de término e a avaliação de pendências ou riscos remanescentes. O término não pode anteceder o início nem estar no futuro.");
  if (!["save", "include", "close"].includes(input.operation)) throw new Error("Operação inválida.");
  return { id: input.id, scope: { ...input.scope }, revision: input.expectedRevision + 1,
    // Any content change requires a new explicit review, even on an included annex.
    status: input.operation === "close" ? "closed" : input.operation === "include" ? "included" : "draft",
    fields: { ...fields }, actorUserId: input.actorUserId, recordedAt: input.recordedAt, reason: input.reason.trim(),
    ...(input.operation === "close" ? { closure: { endedOn: input.endedOn!, remainingActions: input.remainingActions!.trim() } } : {}),
  };
}
