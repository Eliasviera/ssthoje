import { createHash } from "node:crypto";
import type { PgrRiskInventory } from "./pgr-risk-inventory";
import { isPgrColumnCorrectionVerified, type ColumnCorrections } from "./pgr-column-corrections";

type Table = Array<Array<string | null>>;
export type SourceProfile = {
  schemaVersion: number; sha256: string; pageCount: number;
  columnCorrectionProof?: ColumnCorrections;
  pages: Array<{ number: number; text: string; tables: Table[] }>;
  companyFields: Record<string, Array<{ value: string; page: number }>>;
  roles: Array<{ role: string; sector: string; description: string; workforceReported: string[]; page: number; riskAssociations: Array<Record<string, string>> }>;
  risks: Array<{ activity: string; hazard: string; page: number; measures: Array<{ type: string; description: string; reportedEffectiveness?: string[] }>; ppe: Array<{ ca: string; description: string; reportedChecks?: string[] }>; details: Record<string, string | Array<string | null>> }>;
  actionTables: Array<{ page: number; tableIndex: number; rows: Table }>;
};
const compact = (row: Array<string | null>) => row.filter((value): value is string => typeof value === "string" && !!value.trim()).map(value => value.replace(/\s+/g, " ").trim());
const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const labels = ["Razao Social", "CNPJ", "Endereço", "Bairro", "Cidade", "UF", "CEP", "Telefone", "Email", "CNAE Secundário", "CNAE", "Atividade Secundária", "Atividade", "Grau de Risco", "N° de Funcionários", "Horário", "Responsável Legal", "Responsável Técnico", "Responsável pela Elaboração", "Resp. informações", "Função do Elaborador", "Função", "CPF", "CREA", "Insc. Municipal", "Insc. Estadual"];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function enrichPgrProfile(source: SourceProfile) {
  if (source.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(source.sha256) || source.pageCount !== source.pages.length) throw new Error("Fonte incompleta.");
  const companyFields: SourceProfile["companyFields"] = {};
  for (const page of source.pages.filter(page => page.text.includes("Identificação do Estabelecimento"))) {
    for (const label of labels.filter(label => !["CPF", "CREA", "Função"].includes(label))) {
      const regex = new RegExp(`(?:^|\\n|\\s)${escape(label)}\\s*:\\s*([\\s\\S]*?)(?=(?:${labels.map(escape).join("|")})\\s*:|$)`, "g");
      for (const match of page.text.matchAll(regex)) {
        const value = match[1].replace(/\s+/g, " ").trim();
        if (value) (companyFields[label] ??= []).push({ value, page: page.number });
      }
    }
  }
  const actions = source.actionTables.map(action => {
    const page = source.pages.find(page => page.number === action.page)!;
    const previousTable = page.tables[action.tableIndex - 1];
    const scopeRows = previousTable?.map(compact);
    const scope = scopeRows?.[0]?.join("|") === "Unidade|Ambiente de Trabalho|Posto / Atividade" ? scopeRows[1] : [];
    const fields: Record<string, string> = {};
    for (const row of action.rows.map(compact)) {
      if (row.length === 2 && ["Ação Recomendada:", "Descrição", "Prioridade", "Objetivo/Meta", "Responsável", "Início Previsto", "Conclusão Prevista"].includes(row[0])) fields[row[0]] = row[1];
    }
    return { page: action.page, scope, fields, rows: action.rows };
  });
  const exposures = source.pages.flatMap(page => page.tables.flatMap(table => {
    const rows = table.map(compact);
    const index = rows.findIndex(row => row.join("|") === "Data|Intensidade|Nível de Ação|Limite|Técnica");
    return index >= 0 ? table.slice(index + 1).filter(row => row.length === 5 && row.some(value => !!value?.trim())).map(row => ({ page: page.number, date: row[0]?.trim() ?? "", intensity: row[1]?.trim() ?? "", actionLevel: row[2]?.trim() ?? "", limit: row[3]?.trim() ?? "", method: row[4]?.trim() ?? "", status: "reported_pending_review" })) : [];
  }));
  return { ...source, companyFields, actions, exposures };
}

export function projectPgrInventory(profile: ReturnType<typeof enrichPgrProfile>, scope: { tenantId: string; companyId: string; unitId: string; documentId: string }): PgrRiskInventory {
  const reference = (page: number) => `document:${scope.documentId}:page:${page}`;
  const items = profile.risks.map(risk => {
    const roles = profile.roles.filter(role => role.riskAssociations.some(link => norm(link.Origem ?? "") === norm(risk.activity) && norm(link.Perigo ?? "") === norm(risk.hazard)));
    const scopes = [...new Set(roles.map(role => role.sector))];
    const source = risk.details.sourceAndPropagationRawCells;
    const correctedColumns = isPgrColumnCorrectionVerified(profile, risk);
    const circumstance = risk.details.circumstance;
    const exposures = profile.exposures.filter(exposure => exposure.page === risk.page);
    const measures = [...risk.measures.map(measure => `${measure.type}: ${measure.description}`), ...risk.ppe.map(ppe => `EPI: ${ppe.description} · CA informado: ${ppe.ca}`)];
    // Split long measures rather than truncate any source text.
    const splitMeasures = measures.flatMap(measure => measure.match(/[\s\S]{1,1000}/g) ?? []);
    const reportedClassification = roles.flatMap(role => role.riskAssociations.filter(link => norm(link.Origem ?? "") === norm(risk.activity) && norm(link.Perigo ?? "") === norm(risk.hazard)).map(link => `${role.role}: probabilidade ${link["Probabil."]}; severidade ${link.Severidade}; nível ${link["Nível de Risco"]}`));
    return { id: createHash("sha256").update(`${profile.sha256}:${risk.page}:${risk.activity}:${risk.hazard}`).digest("hex").slice(0, 48),
      process: scopes.join("; "), activity: risk.activity, hazard: risk.hazard,
      sourceCircumstance: [correctedColumns ? `Fonte geradora: ${risk.details.sourceGenerator}\nMeio de propagação: ${risk.details.propagationMedium}` : Array.isArray(source) ? `Fonte/propagação (células originais): ${source.filter(Boolean).join(" | ")}` : "", typeof circumstance === "string" ? circumstance : ""].filter(Boolean).join("\n"),
      possibleHarm: typeof risk.details.possibleHarm === "string" ? risk.details.possibleHarm : "",
      exposedGroups: [...new Set(roles.map(role => role.role))],
      exposureDescription: [risk.details.exposureTime, risk.details.frequency, ...exposures.map(exposure => `Quadro quantitativo relatado: ${exposure.date}; intensidade ${exposure.intensity || "não informada"}; método ${exposure.method || "não informado"}; nível de ação ${exposure.actionLevel || "não informado"}; limite informado ${exposure.limit || "não informado"}. Responsável pela medição a conferir no original.`)].filter(Boolean).join("\n"),
      existingMeasures: splitMeasures, evidenceRefs: [reference(risk.page), ...roles.map(role => reference(role.page))],
      assessment: { status: "reported" as const, ...(reportedClassification.length && reportedClassification.join("\n").length <= 1000 ? { decision: `Classificação informada no documento, a conferir:\n${reportedClassification.join("\n")}` } : {}) },
    };
  });
  return { schemaVersion: 1, tenantId: scope.tenantId, companyId: scope.companyId, unitId: scope.unitId, revision: 1,
    title: "PGR 2026 · inventário extraído do documento",
    activityDescription: `Inventário importado do documento ${scope.documentId}. ${profile.roles.length} funções descritas, ${items.length} fichas de perigos. Descrições completas, quantitativos relatados, setores e referências estão no cadastro documental da empresa. Conteúdo relatado, pendente de conferência profissional.`,
    actionPlan: `${profile.actions.length} ações extraídas do documento original. Descrição, objetivo, prioridade, responsável e datas informadas foram preservados no cadastro documental da empresa, com referência à página. Consultar ficha da empresa → PGR → Dados extraídos. Nenhuma ação foi marcada como executada por inferência.`,
    items };
}
