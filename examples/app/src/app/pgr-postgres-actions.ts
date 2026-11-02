"use server";

import { revalidatePath } from "next/cache";
import { validatePgrRiskInventory, type PgrRiskInventory } from "@/lib/pgr-risk-inventory";
import { listPgrInventoriesPostgres, createPgrInventoryPostgres, savePgrInventoryPostgres, transitionPgrInventoryPostgres } from "@/lib/pgr-postgres-store";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { PgrTransitionBlockedError } from "@/lib/pgr-postgres-operations";

export type PgrPostgresFormState = { error?: string; success?: string };

function getText(data: FormData, key: string, maxLength: number): string | null {
  const value = data.get(key);
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function getItems(data: FormData): PgrRiskInventory["items"] | null {
  const raw = data.get("items");
  // Complete imported inventories can exceed 100 KB; retain a bounded payload.
  if (typeof raw !== "string" || raw.length > 1_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PgrRiskInventory["items"] : null;
  } catch {
    return null;
  }
}

function getRevision(data: FormData): number | null {
  const raw = data.get("storageRevision");
  if (typeof raw !== "string" || !/^\d{1,12}$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

export async function savePgrInventoryPostgresAction(_previous: PgrPostgresFormState, data: FormData): Promise<PgrPostgresFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a equipe autorizada pode alterar inventários nesta consultoria." };

  const tenantId = access.context.tenant.id;
  const companyId = getText(data, "companyId", 140);
  const unitId = getText(data, "unitId", 140);
  const title = getText(data, "title", 140);
  const activityDescription = getText(data, "activityDescription", 3000);
  const actionPlan = getText(data, "actionPlan", 5000);
  const items = getItems(data);
  if (!companyId || !unitId || !title?.trim() || !activityDescription?.trim() || !actionPlan?.trim() || !items) {
    return { error: "Confira empresa, unidade, campos obrigatórios e itens de risco." };
  }
  if (items.some((item) => item && typeof item === "object" && "esocialTable24" in item)
    && !hasTenantPermission(access.context.membership.role, "esocial.table24.manage")) {
    return { error: "Seu perfil não pode associar códigos da Tabela 24 aos riscos do PGR." };
  }

  const id = getText(data, "inventoryId", 200);
  let inventory: PgrRiskInventory = {
    schemaVersion: 1,
    tenantId,
    companyId,
    unitId,
    revision: 1,
    title,
    activityDescription,
    actionPlan,
    items,
  };

  if (id) {
    const expectedRevision = getRevision(data);
    if (!expectedRevision) return { error: "A revisão de edição está ausente ou inválida. Atualize a página." };
    const existing = (await listPgrInventoriesPostgres()).find((record) => record.id === id);
    if (!existing || existing.status !== "draft") return { error: "Este inventário não está disponível para edição." };
    if (existing.inventory.companyId !== companyId || existing.inventory.unitId !== unitId) {
      return { error: "A empresa e a unidade não podem ser alteradas depois da criação." };
    }
    inventory = {
      ...inventory,
      revision: expectedRevision,
      legacySource: existing.inventory.legacySource,
    };
    const validated = validatePgrRiskInventory(inventory);
    if ("error" in validated) return { error: validated.error };
    const saved = await savePgrInventoryPostgres(id, expectedRevision, validated.value);
    if (!saved) return { error: "O inventário mudou ou não está mais disponível. Atualize a página." };
  } else {
    const validated = validatePgrRiskInventory(inventory);
    if ("error" in validated) return { error: validated.error };
    await createPgrInventoryPostgres(validated.value);
  }

  revalidatePath("/");
  revalidatePath("/empresas");
  return { success: "Inventário salvo no PostgreSQL." };
}

async function transition(data: FormData, next: "in_review" | "approved"): Promise<PgrPostgresFormState> {
  const permission = next === "approved" ? "documents.review" : "pgr.manage";
  const access = await getCurrentTenantAccess(permission);
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode executar esta transição." };
  const id = getText(data, "inventoryId", 200);
  const revision = getRevision(data);
  if (!id || !revision) return { error: "Identificador ou revisão inválidos. Atualize a página." };
  let saved: PgrRiskInventory | null;
  try {
    saved = await transitionPgrInventoryPostgres(id, next, revision, access.context.tenant.id);
  } catch (error) {
    if (error instanceof PgrTransitionBlockedError) return { error: error.message };
    throw error;
  }
  if (!saved) return { error: "O inventário mudou ou não está mais nesta etapa. Atualize a página." };
  revalidatePath("/");
  revalidatePath("/empresas");
  return { success: next === "approved" ? "Revisão interna registrada." : "Inventário enviado para revisão." };
}

export async function submitPgrInventoryPostgresAction(_previous: PgrPostgresFormState, data: FormData): Promise<PgrPostgresFormState> {
  return transition(data, "in_review");
}

export async function approvePgrInventoryPostgresAction(_previous: PgrPostgresFormState, data: FormData): Promise<PgrPostgresFormState> {
  return transition(data, "approved");
}
