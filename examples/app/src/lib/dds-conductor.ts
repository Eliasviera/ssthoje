// Classificação do responsável pelo DDS — função pura, sem acesso a arquivos,
// para poder ser usada em componentes client e no servidor.

export type DdsConductorKind = "lideranca" | "sst" | "desconhecido";

// Praxe: liderança operacional conduz o DDS. Exceção legítima: pessoal de SST também conduz.
export const DDS_LEADERSHIP_TITLES = ["ENCARREGADO", "SUPERVISOR", "LIDER", "LÍDER", "MESTRE"] as const;
export const DDS_SST_TITLES = ["TÉCNICO DE SEGURANÇA", "TST", "TECNICO EM SEGURANÇA", "ENGENHARIA"] as const;

export function classifyDdsConductor(jobTitle: string | undefined): DdsConductorKind {
  if (!jobTitle) return "desconhecido";
  const normalized = jobTitle.trim().toUpperCase();
  if (DDS_LEADERSHIP_TITLES.some((title) => normalized.includes(title))) return "lideranca";
  if (DDS_SST_TITLES.some((title) => normalized.includes(title))) return "sst";
  return "desconhecido";
}

export const DDS_CONDUCTOR_PRAXIS_TEXT = "Praxe: liderança operacional. SST também pode conduzir (exceção comum).";
