"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { changeTenantSettings, diagnoseTenant, managePlan } from "@/lib/platform-service";
import { OPTIONAL_MODULES, type PlanConfig, type OptionalModule } from "@/lib/plan-catalog";
import type { TenantSettings } from "@/lib/tenant-state";

export type MasterActionState = { error?: string; success?: string; diagnosis?: ReturnType<typeof diagnoseTenant> };
function field(data: FormData, key: string, max: number) { const value = data.get(key); if (typeof value !== "string" || value.length > max) throw new Error("Confira os campos do formulário."); return value; }
export async function masterAction(_previous: MasterActionState, data: FormData): Promise<MasterActionState> {
  const session = await getSession(); if (!session) return { error: "Sua sessão terminou. Entre novamente." };
  try {
    const operation = field(data, "operation", 20), tenantId = field(data, "tenantId", 80), reason = field(data, "reason", 600);
    if (operation === "configure" || operation === "consume") {
      if (data.get("acknowledged") !== "on") throw new Error("Confirme que revisou o efeito da alteração.");
      const integer = (key: string) => { const value = field(data, key, 8); if (!/^\d+$/.test(value)) throw new Error("Informe valores inteiros não negativos."); return Number(value); };
      const selected = data.getAll("enabledModules");
      if (selected.some(value => typeof value !== "string" || !Object.hasOwn(OPTIONAL_MODULES, value))) throw new Error("Confira os módulos selecionados.");
      const input = operation === "configure" ? { operation, config: { plan: field(data, "plan", 30) as PlanConfig["plan"], cycle: field(data, "cycle", 10) as PlanConfig["cycle"], extraCompanies: integer("extraCompanies"), extraWorkers: integer("extraWorkers"), extraStorageMB: integer("extraStorageMB"), extraCredits: integer("extraCredits"), disabledModules: (Object.keys(OPTIONAL_MODULES) as OptionalModule[]).filter(m => !selected.includes(m)) } } as const : { operation, storageMB: integer("storageMB"), credits: integer("credits") } as const;
      managePlan(session.userId, tenantId, input, reason, integer("revision"));
      revalidatePath("/master"); revalidatePath("/"); return { success: "Alteração registrada com histórico. Nenhuma cobrança ou chamada de IA realizada." };
    }
    if (operation === "diagnose") { const diagnosis = diagnoseTenant(session.userId, tenantId, reason); revalidatePath("/master"); return { success: "Diagnóstico restrito registrado.", diagnosis }; }
    if (operation !== "settings") throw new Error("Ação inválida.");
    if (data.get("acknowledged") !== "on") throw new Error("Confirme que revisou o efeito da alteração.");
    const companies = field(data, "companiesLimit", 6), workers = field(data, "workersLimit", 7);
    if (!/^\d+$/.test(companies) || !/^\d+$/.test(workers)) throw new Error("Informe limites inteiros positivos.");
    changeTenantSettings(session.userId, tenantId, { status: field(data, "status", 15) as TenantSettings["status"], companiesLimit: Number(companies), workersLimit: Number(workers) }, reason, field(data, "expected", 200));
    revalidatePath("/master"); revalidatePath("/"); return { success: "Estado e limites registrados com histórico." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente." }; }
}
