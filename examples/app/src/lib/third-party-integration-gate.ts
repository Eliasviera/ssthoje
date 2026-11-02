import type { ComplianceEvaluation, ComplianceRule } from "./compliance-store";
import type { InvitationSummary } from "./third-party-store";
import { buildThirdPartyReport } from "./third-party-report.ts";

export function evaluateIntegrationGate(tenantId: string, invitations: InvitationSummary[], rules: ComplianceRule[], evaluations: ComplianceEvaluation[], today: string, companyRequirements: string[]) {
  const group = buildThirdPartyReport(tenantId, invitations, evaluations)[0];
  const blockers: string[] = [];
  if (!group || !group.scope?.trim()) blockers.push("Informe um escopo explícito em um novo convite; o convite legado não pode ser aprovado por suposição.");
  if (!invitations.some((invite) => !invite.revokedAt)) blockers.push("Não há solicitação não revogada neste escopo.");
  if (group?.medicalAsoRequired || companyRequirements.includes("ASO")) blockers.push("ASO exigido: revisão médica individual de terceiros ainda indisponível. Agendamento bloqueado.");
  if (!group?.rows.length) blockers.push("Nenhum documento exigido foi definido.");
  for (const kind of companyRequirements.filter((kind) => kind !== "ASO")) {
    if (!group?.rows.some((row) => row.kind === kind)) blockers.push(`${kind}: requisito da empresa ainda não solicitado neste escopo.`);
  }
  for (const row of group?.rows ?? []) {
    if (!row.current) { blockers.push(`${row.kind}: aguardando envio.`); continue; }
    if (row.issues.some((issue) => issue.status !== "resolved")) blockers.push(`${row.kind}: há correção ou reavaliação em andamento.`);
    const currentRules = rules.filter((rule) => rule.tenantId === tenantId && rule.documentKind === row.kind && rule.status === "active" && rule.validFrom <= today && (!rule.validUntil || rule.validUntil >= today));
    if (!currentRules.length) blockers.push(`${row.kind}: nenhum critério vigente cadastrado para avaliação.`);
    for (const rule of currentRules) {
      const latest = evaluations.filter((evaluation) => evaluation.tenantId === tenantId && evaluation.documentSource === "contratada" && evaluation.companyId === group?.companyId && evaluation.unitId === group.unitId && evaluation.documentId === row.current!.id && evaluation.documentKind === row.kind && evaluation.ruleId === rule.id && evaluation.ruleVersion === rule.version).sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt) || a.id.localeCompare(b.id)).at(-1);
      if (!latest) {
        blockers.push(`${row.kind} · ${rule.title}: avaliação atual satisfatória ou não aplicável ainda não registrada.`);
      } else if (!["atende", "nao_aplicavel"].includes(latest.result)) {
        const reason = latest.notes.trim() || "pendência identificada na revisão humana.";
        blockers.push(`${row.kind} · ${rule.title}: ${reason}`);
      }
    }
  }
  return { blockers, ready: blockers.length === 0 };
}
