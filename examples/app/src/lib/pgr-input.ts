import type { PgrInput } from "./pgr-store";

export type ParsedPgrForm = PgrInput & { draftId?: string; expectedRevision?: number };

const limits = {
  title: 140,
  companyUnit: 140,
  activityDescription: 3000,
  riskInventory: 5000,
  actionPlan: 5000,
  draftId: 64,
  expectedRevision: 12,
} as const;

function readField(data: FormData, name: keyof typeof limits) {
  const value = data.get(name);
  if (typeof value !== "string") return "";
  return value.trim();
}

export function parsePgrForm(data: FormData): { value: ParsedPgrForm } | { error: string } {
  const fields = Object.fromEntries(Object.keys(limits).map((key) => [key, readField(data, key as keyof typeof limits)])) as Record<keyof typeof limits, string>;
  if (Object.entries(limits).some(([key, limit]) => fields[key as keyof typeof limits].length > limit)) {
    return { error: "Um ou mais campos excedem o limite permitido. Revise o conteúdo sem cortes automáticos." };
  }

  const [companyId, unitId, extra] = fields.companyUnit.split("|");
  if (!fields.title || !companyId || !unitId || extra !== undefined || !fields.activityDescription || !fields.riskInventory || !fields.actionPlan) {
    return { error: "Preencha título, empresa/unidade, atividades, riscos informados e plano de ação." };
  }

  const expectedRevision = fields.expectedRevision ? Number(fields.expectedRevision) : undefined;
  if (fields.draftId && (!Number.isSafeInteger(expectedRevision) || expectedRevision! < 1)) {
    return { error: "A revisão do rascunho está ausente. Atualize a página antes de salvar." };
  }
  if (!fields.draftId && fields.expectedRevision) return { error: "Atualize a página antes de criar outro rascunho." };

  return {
    value: {
      title: fields.title,
      companyId,
      unitId,
      activityDescription: fields.activityDescription,
      riskInventory: fields.riskInventory,
      actionPlan: fields.actionPlan,
      ...(fields.draftId ? { draftId: fields.draftId, expectedRevision } : {}),
    },
  };
}
