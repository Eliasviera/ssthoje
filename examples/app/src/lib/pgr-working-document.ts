import type { ImportedPgrProfile } from "./pgr-digitalization-store";
import type { WorkingEntry, WorkingFields, WorkingKind } from "./pgr-working-store";
export const emptyWorkingFields: WorkingFields = { name: "", sector: "", role: "", activity: "", description: "", harm: "", controls: "", evidence: "" };
export function workingDocumentItems(profile: ImportedPgrProfile, history: WorkingEntry[], kind: WorkingKind) {
  const originals = kind === "role" ? profile.roles.map((role, index) => ({ id: `role:${index}`, fields: { ...emptyWorkingFields, name: role.role, sector: role.sector, description: role.description, evidence: `PDF original, página ${role.page}` } })) : kind === "action" ? profile.actions.map((action, index) => ({ id: `action:${index}`, fields: { ...emptyWorkingFields, name: action.fields["Ação Recomendada:"] || `Ação ${index + 1}`, activity: action.scope?.join(" · ") ?? "", description: action.fields.Descrição ?? "", responsible: action.fields.Responsável ?? "", priority: action.fields.Prioridade ?? "", objective: action.fields["Objetivo/Meta"] ?? "", startDate: action.fields["Início Previsto"] ?? "", endDate: action.fields["Conclusão Prevista"] ?? "", evidence: `PDF original, página ${action.page}` } })) : profile.risks.map((risk, index) => ({ id: `risk:${index}`, fields: { ...emptyWorkingFields, name: risk.hazard, activity: risk.activity, description: [risk.details.sourceGenerator, risk.details.propagationMedium, risk.details.circumstance].filter(Boolean).join(" · "), harm: String(risk.details.possibleHarm ?? ""), controls: [...risk.measures.map(item => `${item.type}: ${item.description}`), ...risk.ppe.map(item => `EPI: ${item.description} · CA ${item.ca}`)].join("\n"), evidence: `PDF original, página ${risk.page}` } }));
  const latest = new Map<string, WorkingEntry>();
  for (const entry of history.filter(entry => entry.kind === kind)) {
    if (!latest.has(entry.id) || latest.get(entry.id)!.revision < entry.revision) latest.set(entry.id, entry);
  }
  const additions = [...latest.values()].filter(entry => new RegExp(`^${kind}:new-[a-f0-9-]{36}$`).test(entry.id)).map(entry => ({ id: entry.id, fields: entry.fields }));
  return [...originals, ...additions].map(item => ({ ...item, fields: { ...(latest.get(item.id)?.fields ?? item.fields) }, revision: latest.get(item.id)?.revision ?? 0 }));
}

export function workingFieldLabels(kind: WorkingKind): Partial<Record<keyof WorkingFields, string>> {
  if (kind === "action") return { name: "Ação recomendada", activity: "Unidade, ambiente e atividade", description: "Descrição da ação", priority: "Prioridade", objective: "Objetivo / meta", responsible: "Responsável informado", startDate: "Início previsto", endDate: "Conclusão prevista", evidence: "Evidência / origem da informação" };
  return { name: kind === "risk" ? "Perigo / risco" : "Nome da função", sector: "Setor", ...(kind === "risk" ? { role: "Função relacionada", harm: "Possíveis danos / agravos", controls: "Medidas de controle e EPIs" } : {}), activity: "Atividade", description: kind === "risk" ? "Fonte e circunstância" : "Descrição da função", evidence: "Evidência / origem da informação" };
}
export function isWorkingTarget(profile: ImportedPgrProfile, kind: WorkingKind, id: string, history: WorkingEntry[]) {
  if (!id) return true;
  const original = new RegExp(`^${kind}:(0|[1-9][0-9]*)$`).exec(id);
  if (original) {
    const index = Number(original[1]);
    return Number.isSafeInteger(index) && index < (kind === "role" ? profile.roles.length : kind === "risk" ? profile.risks.length : profile.actions.length);
  }
  return new RegExp(`^${kind}:new-[a-f0-9-]{36}$`).test(id) && history.some(entry => entry.id === id && entry.kind === kind);
}
