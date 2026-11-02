export type CorrectionPeriod = { startedOn: string; dueOn: string; calendarDays: 3; timeZone: "America/Sao_Paulo" };

export function createCorrectionPeriod(now = new Date()): CorrectionPeriod {
  const startedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const due = new Date(`${startedOn}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 3);
  return { startedOn, dueOn: due.toISOString().slice(0, 10), calendarDays: 3, timeZone: "America/Sao_Paulo" };
}

export function correctionPeriodLabel(period?: CorrectionPeriod) {
  if (!period) return "Prazo de correção não registrado neste histórico.";
  const day = (value: string) => value.split("-").reverse().join("/");
  return `Prazo interno de correção: ${day(period.startedOn)} até ${day(period.dueOn)} (fim do dia em Brasília) · 3 dias corridos.`;
}
