"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { saveAso, transitionAso } from "@/lib/aso-service";
import type { AsoFitness } from "@/lib/aso-store";

export type AsoFormState = { error?: string; success?: string };
function field(data: FormData, name: string, limit: number, optional = false): string {
  const value = data.get(name);
  if (optional && value === null) return "";
  if (typeof value !== "string" || value.length > limit) throw new Error("Confira os campos e tente novamente.");
  return value.trim();
}
export async function changeAsoAction(_state: AsoFormState, data: FormData): Promise<AsoFormState> {
  const access = await getCurrentTenantAccess("aso.manage");
  if (!access.authenticated || !access.context) return { error: "Ação exclusiva do médico vinculado à unidade." };
  try {
    const operation = field(data, "operation", 10);
    const id = field(data, "recordId", 64, true);
    const versionText = field(data, "version", 10);
    if (!/^\d+$/.test(versionText)) return { error: "Versão inválida. Atualize a página." };
    const version = Number(versionText);
    if (!Number.isSafeInteger(version)) return { error: "Versão inválida. Atualize a página." };
    if (operation === "save") {
      const names = data.getAll("examName"), dates = data.getAll("examDate");
      if (names.length > 10 || names.length !== dates.length) return { error: "Confira a lista de exames; limite de dez por registro nesta demonstração." };
      const exams = names.map((name, i) => {
        const date = dates[i];
        if (typeof name !== "string" || typeof date !== "string") throw new Error("Confira os campos dos exames.");
        return { name: name.trim(), date: date.trim() };
      }).filter(e => e.name || e.date);
      await saveAso(access.session.userId, field(data, "workerId", 64), version, {
        appointmentDate: field(data, "appointmentDate", 10), reference: field(data, "reference", 100),
        nextExamDueOn: field(data, "nextExamDueOn", 10, true) || undefined,
        fitness: field(data, "fitness", 12) as AsoFitness, exams,
      }, id || undefined);
    } else if (operation === "submit" || operation === "review") {
      if (!id) return { error: "Selecione um ASO salvo." };
      await transitionAso(access.session.userId, id, version, operation);
    } else return { error: "Ação inválida." };
    revalidatePath("/");
    revalidatePath("/aso");
    revalidatePath("/auditoria-nrs");
    return { success: operation === "save" ? "Versão fictícia salva e preservada." : operation === "submit" ? "ASO enviado para revisão interna." : "Revisão interna registrada, sem assinatura ou liberação do trabalhador." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente." }; }
}
