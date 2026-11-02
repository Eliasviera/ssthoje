import type { enrichPgrProfile } from "./pgr-profile-projection";
import { isPgrColumnCorrectionVerified } from "./pgr-column-corrections";

type Profile = ReturnType<typeof enrichPgrProfile>;
export type PgrImportIssue = { code: string; page: number; description: string };

function civilDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function reviewPgrImport(profile: Profile) {
  const issues: PgrImportIssue[] = [];
  const add = (code: string, page: number, description: string) => issues.push({ code, page, description });
  let roleTotal = 0;
  let completeTotals = profile.roles.length > 0;
  const roles = new Set<string>();
  for (const role of profile.roles) {
    const key = `${role.role}|${role.sector}`.trim().toLocaleUpperCase("pt-BR");
    if (roles.has(key)) add("ROLE_DUPLICATE", role.page, `Função/setor repetidos: ${role.role} · ${role.sector}. Conferir antes de somar pessoas.`);
    roles.add(key);
    const index = role.workforceReported.indexOf("Total");
    const value = index >= 0 ? role.workforceReported[index + 1] : undefined;
    if (value !== undefined && /^\d+$/.test(value)) roleTotal += Number(value);
    else { completeTotals = false; add("ROLE_TOTAL_MISSING", role.page, `Total de trabalhadores não identificado para ${role.role}.`); }
    if (!role.description.trim()) add("ROLE_DESCRIPTION_MISSING", role.page, `Descrição da função ${role.role} não identificada.`);
  }
  const reported = profile.companyFields["N° de Funcionários"] ?? [];
  const distinctTotals = [...new Set(reported.map(entry => entry.value.trim()))];
  const establishmentTotal = distinctTotals.length === 1 && /^\d+$/.test(distinctTotals[0]) ? Number(distinctTotals[0]) : null;
  const totalsComparable = completeTotals && roles.size === profile.roles.length && establishmentTotal !== null;
  if (distinctTotals.length > 1) add("COMPANY_TOTAL_CONFLICT", reported[0].page, "Há mais de um total de trabalhadores informado para o estabelecimento.");
  if (totalsComparable && roleTotal !== establishmentTotal) add("WORKFORCE_MISMATCH", reported[0].page, `Total informado no estabelecimento: ${establishmentTotal}; soma dos totais por função: ${roleTotal}. Conferir abrangência e possíveis sobreposições.`);
  for (const evaluation of profile.exposures) {
    const missing = [["intensity", "intensidade"], ["method", "técnica"], ["limit", "limite"]].filter(([key]) => !evaluation[key as "intensity" | "method" | "limit"].trim()).map(([, label]) => label);
    if (missing.length) add("EXPOSURE_FIELDS_MISSING", evaluation.page, `Quadro quantitativo sem ${missing.join(", ")} na extração. Confira as células do original; o nível de ação não substitui a intensidade.`);
    if (!civilDate(evaluation.date)) add("EXPOSURE_DATE_INVALID", evaluation.page, "Data da avaliação quantitativa ausente ou inválida na extração.");
  }
  for (const action of profile.actions) {
    const start = civilDate(action.fields["Início Previsto"] ?? "");
    const end = civilDate(action.fields["Conclusão Prevista"] ?? "");
    if (!start || !end) add("ACTION_DATE_INVALID", action.page, "Início ou conclusão previstos ausentes ou inválidos na extração da ação.");
    else if (end < start) add("ACTION_DATE_ORDER", action.page, "Conclusão prevista anterior ao início previsto. Confira a ação no original.");
  }
  for (const risk of profile.risks) {
    const raw = risk.details.sourceAndPropagationRawCells;
    if (Array.isArray(raw) && !isPgrColumnCorrectionVerified(profile, risk)) {
      const values = raw.filter((value): value is string => !!value?.trim());
      if (values.length >= 2 && /\s[\p{L}]$/u.test(values[0]) && /^[\p{Ll}]/u.test(values[1])) add("SOURCE_CELL_BOUNDARY", risk.page, `Possível palavra dividida pela borda da tabela em fonte/propagação de ${risk.hazard}. Conferir as duas colunas no PDF; o texto original foi preservado.`);
    }
  }
  return { issues, roleTotal: completeTotals ? roleTotal : null, establishmentTotal, totalsComparable, totalsMatch: totalsComparable ? roleTotal === establishmentTotal : null };
}
