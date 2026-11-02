"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { manageBilling } from "@/lib/billing-service";
import type { BillingAction, InvoiceStatus } from "@/lib/billing-types";
export type BillingActionState = { error?: string; success?: string };
function field(data: FormData, key: string, max: number) { const value = data.get(key); if (typeof value !== "string" || value.length > max) throw new Error("Confira os campos da operação."); return value; }
export async function billingAction(_previous: BillingActionState, data: FormData): Promise<BillingActionState> {
  const session = await getSession(); if (!session) return { error: "Sua sessão terminou. Entre novamente." };
  try {
    if (data.get("acknowledged") !== "on") throw new Error("Confirme que revisou a operação simulada.");
    const revision = field(data, "revision", 10); if (!/^\d+$/.test(revision)) throw new Error("Atualize a página antes de registrar.");
    const operation = field(data, "operation", 30) as BillingAction;
    const amount = operation === "reconcile" ? field(data, "referenceAmountCents", 10) : "";
    if (operation === "reconcile" && !/^\d+$/.test(amount)) throw new Error("Informe o valor inteiro em centavos.");
    const planRevision = ["start", "issue"].includes(operation) ? field(data, "planRevision", 10) : "";
    if (["start", "issue"].includes(operation) && !/^\d+$/.test(planRevision)) throw new Error("Atualize a página e revise o plano.");
    const result = manageBilling(session.userId, field(data, "tenantId", 80), { action: operation, requestId: field(data, "requestId", 160), expectedRevision: Number(revision), reason: field(data, "reason", 600), ...(data.has("invoiceId") ? { invoiceId: field(data, "invoiceId", 80) } : {}), ...(["start", "issue"].includes(operation) ? { expectedPlanRevision: Number(planRevision) } : {}), ...(operation === "reconcile" ? { referenceStatus: field(data, "referenceStatus", 20) as InvoiceStatus, referenceAmountCents: Number(amount) } : {}) });
    revalidatePath("/master");
    return { success: result.duplicate ? "Operação já registrada; nenhum efeito duplicado." : operation === "reconcile" ? result.matched ? "Extrato fictício confere com a cobrança local. Conferência registrada." : "Divergência encontrada e registrada. O estado da cobrança não foi alterado." : "Evento simulado registrado. Nenhum pagamento, cobrança ou estorno real foi realizado." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a operação." }; }
}
