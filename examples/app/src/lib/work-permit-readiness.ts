import type { SafetyApr } from "./safety-operations-store";
import type { PgrInventoryRecord } from "./pgr-postgres-operations";
import type { ClientCompany } from "./client-store";

// Estados de produto informativos; não representam prontidão ou classificação normativa.
export const WORK_PERMIT_TYPES = [
  { label: "02 · Altura", status: "Somente demonstração; conteúdo técnico revisado ainda não fornecido." },
  { label: "03 · Trabalho a quente", status: "Planejada; sem checklist ou critérios técnicos implementados." },
  { label: "04 · Içamento", status: "Planejada; sem checklist ou critérios técnicos implementados." },
  { label: "05 · Escavação", status: "Planejada; sem checklist ou critérios técnicos implementados." },
  {
    label: "06 · Mergulho profissional",
    status: "Planejada; sem checklist ou critérios técnicos implementados.",
    note: "A aplicabilidade da NORMAM-222 depende do cenário e ficou reservada para ajuste posterior pela equipe.",
  },
  { label: "07 · Elétrica", status: "Planejada; sem checklist ou critérios técnicos implementados." },
] as const;
export const WORK_PERMIT_PTE_TYPES = [
  { label: "01 · Entrada e trabalho em espaço confinado", status: "Planejada; sem checklist ou critérios técnicos implementados." },
] as const;
export const WORK_PERMIT_BLOCKERS = {
  APR_SCOPE_INVALID: "A APR não pertence ao escopo desta consultoria.",
  COMPANY_SCOPE_UNAVAILABLE: "A empresa ou unidade da APR não está ativa/disponível.",
  PGR_SOURCE_UNAVAILABLE: "Não foi possível conferir a fonte PGR. Tente novamente após restabelecer a leitura.",
  PGR_NOT_FOUND: "O inventário PGR da APR não está disponível de forma única neste escopo.",
  PGR_NOT_APPROVED: "O PGR vinculado não está aprovado.",
  PGR_REVISION_CHANGED: "A revisão atual do PGR difere da revisão usada na APR. Revise os vínculos com o responsável.",
  APR_RISKS_INVALID: "Os riscos selecionados na APR estão ausentes, duplicados ou não correspondem à mesma revisão do PGR.",
  APR_RISK_CONTENT_CHANGED: "O conteúdo do risco na APR difere da revisão PGR consultada. A origem precisa ser conferida.",
  PGR_MEASURES_ABSENT: "Há risco selecionado sem medidas registradas no PGR. O responsável precisa conferir o inventário.",
  APR_NOT_IN_REVIEW: "A APR ainda não foi enviada para revisão humana.",
  APR_CHECKLIST_INCOMPLETE: "O checklist da APR está incompleto ou contém ponto a tratar; a equipe precisa revisar as respostas.",
  TECHNICAL_PARAMETERS_PENDING: "Campos e checklists específicos de PT/PTE aguardam definição do responsável técnico.",
  ACTIVITY_RISK_MAPPING_PENDING: "A correspondência entre tipo de trabalho e riscos/controles depende de seleção e validação humana; não há associação automática.",
  OPERATIONAL_RELEASE_UNAVAILABLE: "O fluxo de preenchimento e liberação pelo líder ou supervisor ainda não foi implementado.",
  AUTHORIZATION_FLOW_PENDING: "Faltam os vínculos autenticados e por escopo do líder/supervisor, TST auditor e integrantes signatários.",
} as const;
export type WorkPermitBlocker = keyof typeof WORK_PERMIT_BLOCKERS;
export type WorkPermitReadiness = {
  canIssue: false;
  linksVerified: boolean;
  blockers: WorkPermitBlocker[];
  risks: Array<{ id: string; activity: string; hazard: string; existingMeasures: string[] }>;
};

/** Conferência estrutural somente leitura; nunca representa autorização de trabalho. */
export function assessWorkPermitReadiness(tenantId: string, apr: SafetyApr, inventories: PgrInventoryRecord[] | null, companies: ClientCompany[]): WorkPermitReadiness {
  const blockers: WorkPermitBlocker[] = [];
  const result = (risks: WorkPermitReadiness["risks"] = [], linksVerified = false): WorkPermitReadiness => ({
    canIssue: false, linksVerified, risks, blockers: [...new Set([...blockers,
      "TECHNICAL_PARAMETERS_PENDING", "ACTIVITY_RISK_MAPPING_PENDING", "OPERATIONAL_RELEASE_UNAVAILABLE", "AUTHORIZATION_FLOW_PENDING"] as WorkPermitBlocker[])],
  });
  if (!tenantId || apr.tenantId !== tenantId) { blockers.push("APR_SCOPE_INVALID"); return result(); }
  const company = companies.find(item => item.tenantId === tenantId && item.id === apr.companyId && item.status === "active");
  if (!company?.units.some(unit => unit.id === apr.unitId)) { blockers.push("COMPANY_SCOPE_UNAVAILABLE"); return result(); }
  if (apr.status !== "in_review") blockers.push("APR_NOT_IN_REVIEW");
  if (!apr.answers.length || new Set(apr.answers.map(answer => answer.id)).size !== apr.answers.length
    || apr.answers.some(answer => !["observed", "not_applicable"].includes(answer.result)
      || (answer.result === "not_applicable" && !answer.notes.trim()))) blockers.push("APR_CHECKLIST_INCOMPLETE");
  if (!inventories) { blockers.push("PGR_SOURCE_UNAVAILABLE"); return result(); }
  const sources = inventories.filter(record => record.id === apr.pgrInventoryId && record.inventory.tenantId === tenantId
    && record.inventory.companyId === apr.companyId && record.inventory.unitId === apr.unitId);
  if (sources.length !== 1) { blockers.push("PGR_NOT_FOUND"); return result(); }
  const source = sources[0];
  if (source.status !== "approved") blockers.push("PGR_NOT_APPROVED");
  if (source.inventory.revision !== apr.pgrRevision) blockers.push("PGR_REVISION_CHANGED");
  if (blockers.includes("PGR_REVISION_CHANGED") || blockers.includes("PGR_NOT_APPROVED")) return result();
  const selectedIds = new Set(apr.risks.map(risk => risk.riskId));
  const selected = source.inventory.items.filter(risk => selectedIds.has(risk.id));
  if (!apr.risks.length || selectedIds.size !== apr.risks.length || selected.length !== selectedIds.size
    || new Set(selected.map(risk => risk.id)).size !== selected.length
    || apr.risks.some(risk => risk.inventoryId !== source.id || risk.inventoryRevision !== apr.pgrRevision)) {
    blockers.push("APR_RISKS_INVALID"); return result();
  }
  if (apr.risks.some(snapshot => {
    const risk = selected.find(item => item.id === snapshot.riskId)!;
    return risk.activity !== snapshot.activity || risk.hazard !== snapshot.hazard || risk.possibleHarm !== snapshot.possibleHarm || risk.exposureDescription !== snapshot.exposureDescription;
  })) { blockers.push("APR_RISK_CONTENT_CHANGED"); return result(); }
  if (selected.some(risk => !risk.existingMeasures.length || risk.existingMeasures.some(measure => !measure.trim()))) blockers.push("PGR_MEASURES_ABSENT");
  return result(selected.map(risk => ({ id: risk.id, activity: risk.activity, hazard: risk.hazard, existingMeasures: [...risk.existingMeasures] })), true);
}
