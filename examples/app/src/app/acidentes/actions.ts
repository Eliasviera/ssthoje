"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import {
  AccidentError,
  createAccident,
  markCatReady,
  registerTransmission,
  updateAccident,
  type AccidentFormInput,
} from "@/lib/accident-store";
import { canAccessCompanyResource } from "@/lib/client-company-scope";

export type AccidentFormState = { error?: string; success?: string };

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new AccidentError("Confira os campos e seus limites.");
  return value.trim();
}

function failure(error: unknown): AccidentFormState {
  if (error instanceof AccidentError) return { error: error.message };
  return { error: "Não foi possível salvar. Atualize a página e tente novamente." };
}

type Access = Awaited<ReturnType<typeof getCurrentTenantAccess>> & { context: NonNullable<Awaited<ReturnType<typeof getCurrentTenantAccess>>["context"]> };

async function resolveScope(data: FormData, access: Access) {
  const scope = text(data, "scope", 281);
  if (!scope) throw new AccidentError("Selecione a empresa e a unidade do acidente.");
  const parts = scope.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new AccidentError("Selecione empresa e unidade.");
  const [companyId, unitId] = parts;
  const company = (await listClientCompanies(access.context.tenant.id)).find((item) => item.id === companyId && item.status === "active");
  if (!company?.units.some((unit) => unit.id === unitId)) throw new AccidentError("Selecione empresa e unidade ativas desta consultoria.");
  if (!canAccessCompanyResource(access.context, { tenantId: access.context.tenant.id, companyId, unitId })) {
    throw new AccidentError("Empresa ou unidade fora do seu acesso.");
  }
  return { companyId, unitId };
}

function readInput(data: FormData, companyId: string, unitId: string, canSeeSensitive: boolean): AccidentFormInput {
  return {
    companyId,
    unitId,
    workerName: text(data, "workerName", 120),
    workerDocument: text(data, "workerDocument", 20),
    workerRole: text(data, "workerRole", 120),
    occurredOn: text(data, "occurredOn", 10),
    occurredAtTime: text(data, "occurredAtTime", 5),
    type: text(data, "type", 20),
    catType: text(data, "catType", 20),
    previousCatNumber: text(data, "previousCatNumber", 60),
    location: text(data, "location", 200),
    description: text(data, "description", 4000),
    lastWorkDay: text(data, "lastWorkDay", 10),
    hadLeave: text(data, "hadLeave", 3) === "yes",
    death: text(data, "death", 3) === "yes",
    deathDate: text(data, "deathDate", 10),
    doctorName: text(data, "doctorName", 120),
    crm: text(data, "crm", 30),
    crmUf: text(data, "crmUf", 2),
    attendedOn: text(data, "attendedOn", 10),
    // Quem não tem permissão de dado sensível não informa CID nem por formulário adulterado.
    cid: canSeeSensitive ? text(data, "cid", 10) : "",
    daysOff: text(data, "daysOff", 4),
  };
}

export async function reportAccidentAction(_previous: AccidentFormState, data: FormData): Promise<AccidentFormState> {
  const access = await getCurrentTenantAccess("accident.report");
  if (!access.context) return { error: "Seu perfil não pode registrar acidentes." };
  try {
    const { companyId, unitId } = await resolveScope(data, access as Access);
    const canSeeSensitive = hasTenantPermission(access.context.membership.role, "accident.sensitive.read");
    const record = createAccident({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      input: readInput(data, companyId, unitId, canSeeSensitive),
    });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "accident.reported", targetId: record.id });
    revalidatePath("/acidentes");
    return { success: `Acidente registrado como ${record.protocol}. Complete as pendências para montar a CAT.` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateAccidentAction(_previous: AccidentFormState, data: FormData): Promise<AccidentFormState> {
  const access = await getCurrentTenantAccess("accident.manage");
  if (!access.context) return { error: "Seu perfil não pode alterar registros de acidente." };
  try {
    const { companyId, unitId } = await resolveScope(data, access as Access);
    const canSeeSensitive = hasTenantPermission(access.context.membership.role, "accident.sensitive.read");
    const record = updateAccident({
      tenantId: access.context.tenant.id,
      id: text(data, "id", 36),
      actorUserId: access.session.userId,
      input: readInput(data, companyId, unitId, canSeeSensitive),
    });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "accident.updated", targetId: record.id });
    revalidatePath("/acidentes");
    return { success: "Registro atualizado. Confira as pendências antes de marcar a CAT como pronta." };
  } catch (error) {
    return failure(error);
  }
}

export async function markCatReadyAction(_previous: AccidentFormState, data: FormData): Promise<AccidentFormState> {
  const access = await getCurrentTenantAccess("accident.manage");
  if (!access.context) return { error: "Seu perfil não pode conferir a CAT." };
  try {
    const record = markCatReady({
      tenantId: access.context.tenant.id,
      id: text(data, "id", 36),
      actorUserId: access.session.userId,
    });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "accident.cat_ready", targetId: record.id });
    revalidatePath("/acidentes");
    return { success: "CAT pronta para transmissão pelo cliente. O sistema não transmite nem substitui o eSocial/CATWeb." };
  } catch (error) {
    return failure(error);
  }
}

export async function registerTransmissionAction(_previous: AccidentFormState, data: FormData): Promise<AccidentFormState> {
  const access = await getCurrentTenantAccess("accident.manage");
  if (!access.context) return { error: "Seu perfil não pode registrar a transmissão." };
  try {
    const record = registerTransmission({
      tenantId: access.context.tenant.id,
      id: text(data, "id", 36),
      actorUserId: access.session.userId,
      channel: text(data, "channel", 20),
      number: text(data, "number", 60),
    });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "accident.transmitted_registered", targetId: record.id });
    revalidatePath("/acidentes");
    return { success: "Número da CAT registrado. Guarde o comprovante do canal oficial com o cliente." };
  } catch (error) {
    return failure(error);
  }
}
