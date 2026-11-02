import type { InvitationSummary } from "./third-party-store";
import type { ComplianceEvaluation } from "./compliance-store";

export type ThirdPartyValidityStatus = "not_received" | "not_informed" | "current" | "expired";

export function brasiliaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Invitations must come from the authorized, tenant-scoped service.
export function buildThirdPartyReport(tenantId: string, invitations: InvitationSummary[], evaluations: ComplianceEvaluation[], asOfDate = brasiliaDate()) {
  const groups = new Map<string, InvitationSummary[]>();
  for (const invite of invitations) {
    // Chave apenas para agregar a tela/relatório legado. CNPJ e escopo textual
    // não identificam third_party_id/workflow_id e nunca devem virar FK ou grant.
    const key = JSON.stringify([invite.companyId, invite.unitId, invite.contractorCnpj, invite.scope?.trim().toLocaleLowerCase("pt-BR") || invite.id]);
    groups.set(key, [...(groups.get(key) ?? []), invite]);
  }
  return [...groups.values()].map((invites) => {
    const representative = [...invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const kinds = [...new Set(invites.flatMap((invite) => invite.requested))];
    const rows = kinds.map((kind) => {
      const receipts = invites.flatMap((invite) => invite.receipts.filter((receipt) => receipt.kind === kind));
      const replaced = new Set(receipts.map((receipt) => receipt.replacesReceiptId));
      const current = receipts.filter((receipt) => !replaced.has(receipt.id)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id)).at(-1);
      const latestByRule = new Map<string, ComplianceEvaluation>();
      for (const evaluation of evaluations) {
        if (!current || evaluation.tenantId !== tenantId || evaluation.documentSource !== "contratada" || evaluation.documentId !== current.id || evaluation.companyId !== representative.companyId || evaluation.unitId !== representative.unitId || evaluation.documentKind !== kind) continue;
        const previous = latestByRule.get(evaluation.ruleId);
        if (!previous || previous.evaluatedAt < evaluation.evaluatedAt) latestByRule.set(evaluation.ruleId, evaluation);
      }
      const reviews = [...latestByRule.values()].map((evaluation) => ({ id: evaluation.id, criterion: evaluation.ruleTitle, criterionVersion: evaluation.ruleVersion, result: evaluation.result, responsible: evaluation.responsible, nextStep: evaluation.nextStep, evaluatedAt: evaluation.evaluatedAt }));
      const issues = invites.flatMap((invite) => (invite.issues ?? []).filter((issue) => issue.kind === kind).map((issue) => ({ id: issue.id, status: issue.status, responsible: issue.assigneeUserId, requestedChange: issue.requestedChange, receiptId: issue.currentReceiptId, correctionPeriod: issue.correctionPeriod ? { ...issue.correctionPeriod } : undefined })));
      const validityStatus: ThirdPartyValidityStatus = !current ? "not_received" : !current.validUntil ? "not_informed" : current.validUntil < asOfDate ? "expired" : "current";
      return { kind, current: current ? { id: current.id, fileName: current.fileName, receivedAt: current.receivedAt, validUntil: current.validUntil } : null, validityStatus, versions: receipts.length, reviews, issues };
    });
    return { companyName: representative.companyName, companyId: representative.companyId, unitName: representative.unitName, unitId: representative.unitId, contractorName: representative.contractorName, contractorCnpj: representative.contractorCnpj, scope: representative.scope, medicalAsoRequired: invites.some((invite) => invite.medicalAsoRequired), rows };
  });
}
