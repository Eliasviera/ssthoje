"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";
import { appendAuditEvent } from "@/lib/audit-log";
import { createDds, closeDds, signDdsAttendee, signDdsResponsible, DdsError } from "@/lib/dds-store";

export type DdsFormState = { error?: string; success?: string };

function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new DdsError("Confira os campos e seus limites.");
  return value.trim();
}
function revisionOf(data: FormData) {
  const revision = field(data, "revision", 10);
  if (!/^[1-9]\d*$/.test(revision)) throw new DdsError("Atualize a página e tente novamente.");
  return Number(revision);
}
function failure(error: unknown): DdsFormState {
  return { error: error instanceof DdsError ? error.message : "Não foi possível salvar. Atualize a página e tente novamente." };
}
type Access = NonNullable<Awaited<ReturnType<typeof getCurrentTenantAccess>>["context"]>;
function audit(context: Access, userId: string, action: "dds.created" | "dds.signed" | "dds.responsible_signed" | "dds.closed") {
  appendAuditEvent({ tenantId: context.tenant.id, actorUserId: userId, actorRole: context.membership.role, action });
}

export async function createDdsAction(_previous: DdsFormState, data: FormData): Promise<DdsFormState> {
  const access = await getCurrentTenantAccess("dds.manage");
  if (!access.context) return { error: "Seu perfil não pode registrar DDS." };
  try {
    const tenantId = access.context.tenant.id;
    const scope = field(data, "scope", 281).split("|");
    if (scope.length !== 2 || !scope[0] || !scope[1]) throw new DdsError("Selecione empresa e unidade.");
    const [companyId, unitId] = scope;
    const company = (await listClientCompanies(tenantId)).find((item) => item.id === companyId && item.status === "active");
    if (!company?.units.some((unit) => unit.id === unitId)) throw new DdsError("Selecione empresa e unidade ativas desta consultoria.");
    const workers = new Map(listWorkersForTenant(tenantId).filter((worker) => worker.status === "active").map((worker) => [worker.id, worker]));
    const registered = data.getAll("workerIds").map((value) => {
      const worker = typeof value === "string" ? workers.get(value) : undefined;
      if (!worker) throw new DdsError("Participante cadastrado indisponível.");
      return { workerId: worker.id, workerName: worker.displayName };
    });
    const manual = field(data, "manualNames", 2000).split("\n").map((line) => line.trim()).filter(Boolean).map((workerName) => ({ workerName }));
    createDds({ tenantId, companyId, unitId, actorUserId: access.session.userId,
      theme: field(data, "theme", 160), heldOn: field(data, "heldOn", 10), location: field(data, "location", 200),
      responsible: field(data, "responsible", 120), notes: field(data, "notes", 1000), attendees: [...registered, ...manual] });
    audit(access.context, access.session.userId, "dds.created");
    revalidatePath("/dds");
    return { success: "DDS registrado. Colete as assinaturas na tela." };
  } catch (error) { return failure(error); }
}

export async function signDdsAction(_previous: DdsFormState, data: FormData): Promise<DdsFormState> {
  const access = await getCurrentTenantAccess("dds.manage");
  if (!access.context) return { error: "Seu perfil não pode coletar assinaturas." };
  try {
    const common = { tenantId: access.context.tenant.id, id: field(data, "id", 36), revision: revisionOf(data), image: field(data, "image", 120000), actorUserId: access.session.userId };
    const attendeeId = field(data, "attendeeId", 36);
    if (attendeeId === "responsible") {
      signDdsResponsible(common);
      audit(access.context, access.session.userId, "dds.responsible_signed");
    } else {
      signDdsAttendee({ ...common, attendeeId });
      audit(access.context, access.session.userId, "dds.signed");
    }
    revalidatePath("/dds");
    return { success: "Assinatura registrada." };
  } catch (error) { return failure(error); }
}

export async function closeDdsAction(_previous: DdsFormState, data: FormData): Promise<DdsFormState> {
  const access = await getCurrentTenantAccess("dds.manage");
  if (!access.context) return { error: "Seu perfil não pode encerrar DDS." };
  try {
    closeDds({ tenantId: access.context.tenant.id, id: field(data, "id", 36), revision: revisionOf(data), actorUserId: access.session.userId });
    audit(access.context, access.session.userId, "dds.closed");
    revalidatePath("/dds");
    return { success: "DDS encerrado. O registro não pode mais ser alterado." };
  } catch (error) { return failure(error); }
}
