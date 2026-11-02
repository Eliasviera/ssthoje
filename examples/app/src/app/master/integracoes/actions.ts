"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { runIntegrationSandbox } from "@/lib/integration-service";
import type { IntegrationKind } from "@/lib/integration-adapters";
import type { Scenario } from "@/lib/integration-store";
export type IntegrationState = { error?: string; success?: string };
export async function sandboxAction(_previous: IntegrationState, data: FormData): Promise<IntegrationState> {
  const session = await getSession(); if (!session) return { error: "Entre novamente para testar." };
  try {
    const field = (name: string) => { const v = data.get(name); if (typeof v !== "string" || v.length > 600) throw new Error("Confira os campos."); return v; };
    const result = runIntegrationSandbox(session.userId, field("tenantId"), field("kind") as IntegrationKind, field("scenario") as Scenario, field("key"), field("reason"));
    revalidatePath("/master/integracoes");
    return { success: result.repeated ? "Requisição já registrada. Nenhum novo processamento." : "Teste registrado. Confira o resultado e os eventos abaixo. Nenhum serviço externo foi chamado." };
  } catch (e) { return { error: e instanceof Error ? e.message : "Não foi possível registrar. Atualize a página." }; }
}
