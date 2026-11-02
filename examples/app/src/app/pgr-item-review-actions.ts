"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readCompanyPgrDigitalization } from "@/lib/pgr-digitalization-store";
import { savePgrItemReview, type PgrItemReview } from "@/lib/pgr-item-review-store";
import { pgrReviewTargetExists } from "@/lib/pgr-review-target";
export type ItemReviewState = { error?: string; success?: string; entry?: PgrItemReview };
export async function savePgrItemReviewAction(_previous: ItemReviewState, data: FormData): Promise<ItemReviewState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não permite registrar revisões." };
  const companyId = data.get("companyId"), sha256 = data.get("sha256"), itemKey = data.get("itemKey"), status = data.get("status"), note = data.get("note"), revision = data.get("revision");
  if ([companyId, sha256, itemKey, status, note, revision].some(value => typeof value !== "string")) return { error: "Confira os campos da revisão." };
  const profile = readCompanyPgrDigitalization(access.context.tenant.id, companyId as string);
  if (!profile || profile.sha256 !== sha256) return { error: "O PGR mudou ou não está disponível. Atualize a página." };
  if (!pgrReviewTargetExists(itemKey as string, profile) || !/^\d+$/.test(revision as string)) return { error: "Item de origem inválido." };
  try {
    const entry = savePgrItemReview(access.context.tenant.id, profile.companyId, profile.sha256, { itemKey: itemKey as string, status: status as PgrItemReview["status"], note: note as string, actorUserId: access.session.userId }, Number(revision));
    revalidatePath(`/empresas/${profile.companyId}`);
    return { success: "Conferência salva. O conteúdo original permanece preservado.", entry };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar a conferência." }; }
}
