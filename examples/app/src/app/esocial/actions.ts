"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { getEsocialCode, type EsocialTableId } from "@/lib/esocial-catalog";
import {
  createEsocialMapping,
  EsocialMappingValidationError,
  reviewEsocialMapping,
  saveEsocialMappingDraft,
  type EsocialMappingFields,
} from "@/lib/esocial-mapping-store";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listAssignedPcmso } from "@/lib/pcmso-service";
import { findPcmsoEsocialSource, type PcmsoEsocialSource } from "@/lib/pcmso-esocial-reference";

export type EsocialMappingFormState = { error?: string; success?: string };

function text(data: FormData, name: string, maximum: number) {
  const value = data.get(name);
  return typeof value === "string" && value.length <= maximum ? value.trim() : "";
}

function positiveInteger(value: string) {
  if (!/^[1-9]\d{0,8}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function tableId(data: FormData): EsocialTableId | null {
  const value = data.get("tableId");
  return value === "24" || value === "27" ? value : null;
}

function fields(data: FormData): EsocialMappingFields | null {
  const selectedTable = tableId(data);
  const code = text(data, "code", 12);
  if (!selectedTable || !getEsocialCode(selectedTable, code)) return null;
  return {
    tableId: selectedTable,
    code,
    sourceReference: text(data, "sourceReference", 300),
    targetDescription: text(data, "targetDescription", 1000),
    rationale: text(data, "rationale", 2000),
  };
}

function permissionFor(table: EsocialTableId) {
  return table === "24" ? "esocial.table24.manage" as const : "esocial.table27.manage" as const;
}

async function validateCompanyUnit(tenantId: string, companyId: string, unitId: string) {
  const companies = await listClientCompanies(tenantId);
  return companies.some((company) => company.id === companyId && company.status === "active"
    && company.units.some((unit) => unit.id === unitId));
}

function report(error: unknown, fallback: string) {
  if (error instanceof EsocialMappingValidationError) return error.message;
  console.error("Associação eSocial não concluída.", error instanceof Error ? error.name : "unknown");
  return fallback;
}

export async function saveEsocialMappingAction(
  _previous: EsocialMappingFormState,
  data: FormData,
): Promise<EsocialMappingFormState> {
  const mappingFields = fields(data);
  if (!mappingFields) return { error: "Selecione um código oficial da tabela correta." };
  const access = await getCurrentTenantAccess(permissionFor(mappingFields.tableId));
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode registrar esta associação eSocial." };

  const companyId = text(data, "companyId", 140);
  const unitId = text(data, "unitId", 140);
  if (!companyId || !unitId || !(await validateCompanyUnit(access.context.tenant.id, companyId, unitId))) {
    return { error: "Selecione uma empresa/unidade ativa desta consultoria." };
  }
  if (mappingFields.tableId === "27") {
    const assignedRecords = await listAssignedPcmso(access.session.userId);
    const source = findPcmsoEsocialSource(
      assignedRecords.flatMap((record) => record.revisions.map(({ version }): PcmsoEsocialSource => ({
        id: record.id,
        version,
        companyId: record.companyId,
        unitId: record.unitId,
        companyName: record.companyName,
        unitName: record.unitName,
      }))),
      mappingFields.sourceReference,
      { companyId, unitId },
    );
    if (!source) {
      return { error: "Selecione uma versão salva de PCMSO atribuída a você e do mesmo escopo da associação." };
    }
  }
  const mappingId = text(data, "mappingId", 36);
  const rawExpectedRevision = data.get("expectedRevision");
  const expectedRevision = rawExpectedRevision === null ? null : positiveInteger(text(data, "expectedRevision", 9));
  if ((rawExpectedRevision !== null && !expectedRevision) || Boolean(mappingId) !== Boolean(expectedRevision)) {
    return { error: "A revisão do rascunho é inválida. Atualize a página." };
  }
  const supersedesMappingId = text(data, "supersedesMappingId", 36);
  const rawSupersedesRevision = data.get("supersedesRevision");
  const supersedesRevision = rawSupersedesRevision === null ? undefined : positiveInteger(text(data, "supersedesRevision", 9));
  if ((rawSupersedesRevision !== null && !supersedesRevision) || Boolean(supersedesMappingId) !== Boolean(supersedesRevision)) {
    return { error: "A revisão anterior informada é inválida." };
  }

  try {
    const mapping = mappingId
      ? saveEsocialMappingDraft(access.context.tenant.id, mappingId, expectedRevision!, mappingFields, access.session.userId)
      : createEsocialMapping({
        ...mappingFields,
        tenantId: access.context.tenant.id,
        companyId,
        unitId,
        createdBy: access.session.userId,
        ...(supersedesMappingId ? { supersedesMappingId, supersedesRevision: supersedesRevision! } : {}),
      });
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: mappingId ? "esocial.mapping_saved" : "esocial.mapping_created",
      targetId: mapping.id,
    });
    revalidatePath("/esocial");
    revalidatePath("/referencias");
    revalidatePath("/");
    return { success: `Associação salva como rascunho · versão ${mapping.revision}.` };
  } catch (error) {
    return { error: report(error, "Não foi possível salvar a associação.") };
  }
}

export async function reviewEsocialMappingAction(
  _previous: EsocialMappingFormState,
  data: FormData,
): Promise<EsocialMappingFormState> {
  const selectedTable = tableId(data);
  const mappingId = text(data, "mappingId", 36);
  const expectedRevision = positiveInteger(text(data, "expectedRevision", 9));
  const reviewNote = text(data, "reviewNote", 1000);
  if (!selectedTable || !mappingId || !expectedRevision || data.get("confirmReview") !== "yes" || !reviewNote) {
    return { error: "Selecione a confirmação, registre a justificativa e atualize a revisão." };
  }
  const access = await getCurrentTenantAccess(permissionFor(selectedTable));
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode revisar esta associação eSocial." };

  try {
    const mapping = reviewEsocialMapping(
      access.context.tenant.id,
      mappingId,
      expectedRevision,
      access.session.userId,
      reviewNote,
    );
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "esocial.mapping_reviewed",
      targetId: mapping.id,
    });
    revalidatePath("/esocial");
    revalidatePath("/referencias");
    revalidatePath("/");
    return { success: `Revisão humana registrada para a associação · versão ${mapping.revision}.` };
  } catch (error) {
    return { error: report(error, "Não foi possível registrar a revisão humana.") };
  }
}
