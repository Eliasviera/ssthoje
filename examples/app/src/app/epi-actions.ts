"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { createEpiDelivery, createOfflineEpiSubmission, reviewOfflineEpiSubmission, renewEpiLink, cancelEpiDelivery, openEpiPortal, issueEpiMockCode, confirmEpiMock } from "@/lib/epi-service";
import type { EpiItem, EpiPortal } from "@/lib/epi-store";
import { listEpiStock } from "@/lib/epi-stock-store";

export type EpiFormState = { error?: string; success?: string; link?: string; deliveryRef?: string };
export type EpiOfflineFormState = { error?: string; success?: string; submissionRef?: string };
export type EpiPortalState = { error?: string; portal?: EpiPortal; code?: string; codeExpiresAt?: string };
function field(data: FormData, name: string, max: number) {
  const value = data.get(name); if (typeof value !== "string" || value.length > max) throw new Error("Confira os campos e tente novamente."); return value.trim();
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export async function syncOfflineEpiAction(data: FormData): Promise<EpiOfflineFormState> {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated || !access.context) return { error: "Sincronização de entrega offline não autorizada." };
  try {
    const raw = JSON.parse(field(data, "submission", 64_000)) as unknown;
    if (!isRecord(raw) || typeof raw.clientRequestId !== "string" || typeof raw.workerId !== "string" || typeof raw.deliveredOn !== "string" || !Array.isArray(raw.items) || raw.items.length > 20) throw new Error("Confira os dados da entrega offline.");
    const items: EpiItem[] = raw.items.map(value => {
      if (!isRecord(value) || typeof value.name !== "string" || typeof value.size !== "string" || typeof value.quantity !== "number") throw new Error("Confira os itens da entrega offline.");
      const optionalText = (key: string) => {
        const entry = value[key];
        if (entry !== undefined && typeof entry !== "string") throw new Error("Confira os campos dos itens offline.");
        return entry as string | undefined;
      };
      return {
        name: value.name, size: value.size, quantity: value.quantity,
        reference: optionalText("reference") ?? "", ca: optionalText("ca"),
        caValidUntil: optionalText("caValidUntil"), caCheckedOn: optionalText("caCheckedOn"),
      };
    });
    const result = createOfflineEpiSubmission(access.session.userId, {
      clientRequestId: raw.clientRequestId, workerId: raw.workerId, deliveredOn: raw.deliveredOn, items,
    });
    revalidatePath("/"); revalidatePath("/epi/entregas");
    return { submissionRef: result.id, success: "Recebido pelo servidor como pendente de conferência do CA. Nenhuma ficha operacional ou baixa de estoque foi criada." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível sincronizar o registro offline." }; }
}
export async function reviewOfflineEpiAction(data: FormData): Promise<EpiOfflineFormState> {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated || !access.context) return { error: "Revisão do registro offline não autorizada." };
  try {
    const raw = JSON.parse(field(data, "review", 16_000)) as unknown;
    if (!isRecord(raw) || typeof raw.submissionId !== "string" || !Array.isArray(raw.items) || raw.items.length > 20) throw new Error("Confira a revisão dos itens offline.");
    const items = raw.items.map(value => {
      if (!isRecord(value) || typeof value.ca !== "string" || typeof value.caValidUntil !== "string" || typeof value.caCheckedOn !== "string" || value.caManualChecked !== true) throw new Error("Confirme a consulta manual e informe CA, validade e data para cada item.");
      return { ca: value.ca, caValidUntil: value.caValidUntil, caCheckedOn: value.caCheckedOn };
    });
    const delivery = reviewOfflineEpiSubmission(access.session.userId, raw.submissionId, items);
    revalidatePath("/"); revalidatePath("/epi/entregas"); revalidatePath("/epi/fichas"); revalidatePath("/epi/estoque");
    return { submissionRef: delivery.id, success: "Ficha de entrega offline criada após revisão manual do CA. A baixa vinculada no estoque continua pendente até conciliação." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível concluir a revisão offline." }; }
}
export async function createEpiAction(data: FormData): Promise<EpiFormState> {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode registrar entregas." };
  try {
    const names = data.getAll("itemName"), keys = ["itemReference", "itemSize", "itemQuantity", "itemCa", "itemCaValidUntil", "itemCaCheckedOn", "itemManufacturer", "itemLot", "itemProductValidity", "itemProtectionPurpose", "itemDeliveryType", "itemReplacementReason", "itemInstructions", "itemTrainingStatus", "itemTrainingDate"];
    const columns = Object.fromEntries(keys.map(key => [key, data.getAll(key)])) as Record<string, FormDataEntryValue[]>;
    if (names.length < 1 || names.length > 20 || Object.values(columns).some(values => values.length !== names.length) || [...names, ...Object.values(columns).flat()].some(v => typeof v !== "string")) return { error: "Confira os itens e dados da entrega." };
    const value = (key: string, i: number) => columns[key][i] as string;
    const items: EpiItem[] = names.map((name, i) => ({ name: name as string, reference: value("itemReference", i), size: value("itemSize", i), quantity: Number(value("itemQuantity", i)), ca: value("itemCa", i), caValidUntil: value("itemCaValidUntil", i), caCheckedOn: value("itemCaCheckedOn", i), manufacturer: value("itemManufacturer", i), lot: value("itemLot", i), productValidity: value("itemProductValidity", i), protectionPurpose: value("itemProtectionPurpose", i), deliveryType: value("itemDeliveryType", i) === "replacement" ? "replacement" : "initial", replacementReason: value("itemReplacementReason", i), instructions: value("itemInstructions", i), trainingStatus: value("itemTrainingStatus", i) as EpiItem["trainingStatus"], trainingDate: value("itemTrainingDate", i) }));
    const result = createEpiDelivery(access.session.userId, { workerId: field(data, "workerId", 64), deliveredOn: field(data, "deliveredOn", 10), notes: field(data, "notes", 1200), items });
    revalidatePath("/"); revalidatePath("/epi/entregas"); revalidatePath("/epi/fichas"); return { link: result.link, deliveryRef: result.delivery.id, success: "Entrega fictícia registrada. Use a referência para relacionar a baixa no estoque; abra o link para simular a confirmação." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a entrega." }; }
}
export async function renewEpiAction(data: FormData): Promise<EpiFormState> {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated || !access.context) return { error: "Novo link não autorizado." };
  try { const result = renewEpiLink(access.session.userId, field(data, "deliveryId", 64)); revalidatePath("/"); return { link: result.link, success: "Novo link fictício por 24 horas. Link e código anteriores foram invalidados." }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível gerar novo link." }; }
}
export async function cancelEpiAction(data: FormData): Promise<EpiFormState> {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated || !access.context) return { error: "Cancelamento não autorizado." };
  try { const id=field(data,"deliveryId",64); const alreadyIssued=listEpiStock(access.session.userId).some(item=>item.movements.some(m=>m.direction==="exit"&&m.deliveryReference===id)); if(alreadyIssued) return {error:"Esta ficha já tem baixa vinculada no estoque. Preserve o registro e lance a devolução ou ajuste correspondente."}; cancelEpiDelivery(access.session.userId, id, field(data, "reason", 600)); revalidatePath("/"); revalidatePath("/epi/estoque"); revalidatePath("/epi/entregas"); revalidatePath("/epi/fichas"); return { success: "Entrega fictícia cancelada. O histórico foi preservado." }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível cancelar." }; }
}
export async function openEpiPortalAction(data: FormData): Promise<EpiPortalState> {
  try { return { portal: openEpiPortal(field(data, "token", 64)) }; }
  catch { return { error: "Link indisponível, expirado ou com muitas solicitações. Peça novo link à consultoria ou tente novamente em um minuto." }; }
}
export async function issueEpiCodeAction(data: FormData): Promise<EpiPortalState> {
  try { const result = issueEpiMockCode(field(data, "token", 64)); return { code: result.code, codeExpiresAt: result.expiresAt, portal: result.portal }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível gerar código fictício." }; }
}
export async function confirmEpiAction(data: FormData): Promise<EpiPortalState> {
  try {
    const portal = confirmEpiMock(field(data, "token", 64), field(data, "code", 6), data.get("acknowledge") === "yes");
    revalidatePath("/"); return { portal };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível confirmar a simulação." }; }
}
