"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import { createDeviation, transitionDeviation, DeviationError } from "@/lib/deviation-store";
import { canAccessCompanyResource } from "@/lib/client-company-scope";
import { analyzeDeviationPhoto, normalizeDeviationAiDraft, DeviationAiError, type DeviationAiDraft } from "@/lib/deviation-ai";
import { decodePhotoDataUrl, DeviationPhotoError } from "@/lib/deviation-photo";
import { releaseDeviationAiAnalysis, reserveDeviationAiAnalysis, type DeviationAiQuota } from "@/lib/deviation-ai-quota";

export type DeviationFormState = {
  error?: string;
  success?: string;
  notice?: string;
  draft?: DeviationAiDraft;
  quota?: DeviationAiQuota;
};

function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new DeviationError("Confira os campos e seus limites.");
  return value.trim();
}
function failure(error: unknown): DeviationFormState {
  if (error instanceof DeviationError || error instanceof DeviationPhotoError || error instanceof DeviationAiError) return { error: error.message };
  return { error: "Não foi possível salvar. Atualize a página e tente novamente." };
}

type SuggestionContext = { tenantId: string; userId: string; role: Parameters<typeof appendAuditEvent>[0]["actorRole"] };

async function suggestDraft(context: SuggestionContext, data: FormData): Promise<DeviationFormState> {
  const kind = field(data, "kind", 20);
  if (kind !== "deviation" && kind !== "near_miss") throw new DeviationError("Escolha desvio ou quase incidente antes de pedir a sugestão.");
  const location = field(data, "location", 200);
  if (!location) throw new DeviationError("Informe o local antes de pedir a sugestão.");
  const photoValue = field(data, "photo", 1_100_000);
  if (!photoValue) throw new DeviationError("Anexe a foto do local para receber a sugestão de IA.");

  const photo = decodePhotoDataUrl(photoValue);
  const reservation = reserveDeviationAiAnalysis({ tenantId: context.tenantId, userId: context.userId, photoSha256: photo.sha256 });
  if (!reservation.granted) {
    appendAuditEvent({ tenantId: context.tenantId, actorUserId: context.userId, actorRole: context.role, action: "deviation.ai_limit_reached" });
    return { error: reservation.quota.reason ?? "Limite de análises de IA atingido. O relato pode ser registrado manualmente.", quota: reservation.quota };
  }

  try {
    const draft = analyzeDeviationPhoto({ kind, location, photoSha256: photo.sha256 });
    appendAuditEvent({ tenantId: context.tenantId, actorUserId: context.userId, actorRole: context.role, action: "deviation.ai_suggested" });
    return {
      draft,
      quota: reservation.quota,
      notice: reservation.cached
        ? "Esta foto já tinha sugestão hoje: o resultado foi reaproveitado sem consumir nova análise. Revise o texto antes de salvar."
        : "Sugestão simulada gerada. Revise e complete os campos antes de salvar; nada foi registrado ainda.",
    };
  } catch (error) {
    releaseDeviationAiAnalysis({ tenantId: context.tenantId, userId: context.userId, photoSha256: photo.sha256 });
    throw error;
  }
}

export async function reportDeviationAction(_previous: DeviationFormState, data: FormData): Promise<DeviationFormState> {
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.context) return { error: "Seu perfil não pode registrar desvios." };
  const { tenant, membership } = access.context;
  const context: SuggestionContext = { tenantId: tenant.id, userId: access.session.userId, role: membership.role };
  try {
    // Os dois botões do formulário usam a mesma ação: o valor de "intent" decide o caminho.
    if (field(data, "intent", 10) === "suggest") return await suggestDraft(context, data);

    let companyId = "";
    let unitId = "";
    const scope = field(data, "scope", 281);
    if (membership.role === "cliente" && !scope) throw new DeviationError("Selecione uma unidade da empresa vinculada ao seu acesso.");
    if (scope && membership.role === "trabalhador") throw new DeviationError("Registre o local do desvio no campo Local.");
    if (scope) {
      const parts = scope.split("|");
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new DeviationError("Selecione empresa e unidade.");
      [companyId, unitId] = parts;
      const company = (await listClientCompanies(tenant.id)).find((item) => item.id === companyId && item.status === "active");
      if (!company?.units.some((unit) => unit.id === unitId)) throw new DeviationError("Selecione empresa e unidade ativas desta consultoria.");
    }
    if (membership.role === "cliente" && !canAccessCompanyResource(access.context, { tenantId: tenant.id, companyId, unitId })) throw new DeviationError("Empresa ou unidade fora do seu acesso. Selecione uma unidade autorizada.");

    const photoValue = field(data, "photo", 1_100_000);
    const photo = photoValue ? decodePhotoDataUrl(photoValue) : undefined;

    const rawDraft = field(data, "aiDraft", 20_000);
    let ai: DeviationAiDraft | undefined;
    if (rawDraft) {
      try { ai = normalizeDeviationAiDraft(JSON.parse(rawDraft)); }
      catch { throw new DeviationError("O rascunho de IA chegou inválido. Gere novamente ou preencha o relato manualmente."); }
    }
    if (ai && !photo) throw new DeviationError("A sugestão de IA precisa estar ligada à foto do local.");

    const record = createDeviation({
      tenantId: tenant.id, actorUserId: access.session.userId, kind: field(data, "kind", 20), companyId, unitId,
      occurredOn: field(data, "occurredOn", 10), location: field(data, "location", 200), description: field(data, "description", 2000),
      immediateAction: field(data, "immediateAction", 1000), reporterName: membership.displayName,
      photo, ai, aiEdited: field(data, "aiEdited", 1) === "1",
    });
    appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "deviation.reported", targetId: record.id });
    if (record.photo) appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "deviation.photo_attached", targetId: record.id });
    if (record.ai) appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "deviation.ai_reviewed", targetId: record.id });
    revalidatePath("/desvios");
    return { success: record.ai ? "Relato registrado com o rascunho revisado. Obrigado por avisar." : "Relato registrado. Obrigado por avisar." };
  } catch (error) { return failure(error); }
}

export async function transitionDeviationAction(_previous: DeviationFormState, data: FormData): Promise<DeviationFormState> {
  const access = await getCurrentTenantAccess("deviation.manage");
  if (!access.context) return { error: "Seu perfil não pode tratar desvios." };
  try {
    transitionDeviation({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, id: field(data, "id", 36),
      status: field(data, "status", 20), note: field(data, "note", 1000) });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "deviation.status_changed" });
    revalidatePath("/desvios");
    return { success: "Situação atualizada." };
  } catch (error) { return failure(error); }
}
