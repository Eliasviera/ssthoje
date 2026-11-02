"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { readCompanyPgrDigitalization } from "@/lib/pgr-digitalization-store";
import { ANNEX_FIELDS, type AnnexFields } from "@/lib/pgr-contractor-annex";
import { saveContractorAnnex } from "@/lib/pgr-contractor-annex-store";
export type AnnexState = { error?: string; success?: string };
export async function saveContractorAnnexAction(_previous: AnnexState, data: FormData): Promise<AnnexState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Entre em uma conta autorizada para gerenciar anexos do PGR." };
  try {
    const text = (key: string, max = 3000) => { const value = data.get(key); if (value === null) return ""; if (typeof value !== "string" || value.length > max) throw new Error("Um campo enviado é inválido ou excede o limite de texto."); return value.trim(); };
    const companyId = text("companyId", 140);
    const profile = readCompanyPgrDigitalization(access.context.tenant.id, companyId);
    const company = (await listClientCompanies(access.context.tenant.id)).find(item => item.id === companyId && item.status === "active");
    if (!profile || profile.sha256 !== text("sha256", 64) || !company?.units.some(unit => unit.id === profile.unitId)) return { error: "Empresa, unidade ou origem do PGR indisponível. Atualize a página." };
    const operation = text("operation", 10);
    if (!["save", "include", "close"].includes(operation)) return { error: "Operação inválida." };
    const rawRevision = text("revision", 10);
    if (!/^(0|[1-9]\d{0,8})$/.test(rawRevision)) return { error: "Revisão inválida. Atualize a página." };
    const fields = operation === "save" ? Object.fromEntries([...Object.keys(ANNEX_FIELDS), "contractorType", "participants", "coverage"].map(key => [key, text(key)])) as AnnexFields : undefined;
    const record = saveContractorAnnex({ scope: { tenantId: access.context.tenant.id, companyId, unitId: profile.unitId, sha256: profile.sha256 },
      id: text("id", 36) || undefined, expectedRevision: Number(rawRevision), operation: operation as "save" | "include" | "close", fields,
      actorUserId: access.session.userId, reason: text("reason", 2000), confirmed: text("confirmed", 5) === "yes",
      endedOn: text("endedOn", 10), remainingActions: text("remainingActions"),
    });
    revalidatePath(`/empresas/${companyId}`);
    return { success: record.status === "closed" ? "Atividade encerrada. Anexo arquivado no histórico; confira as ações remanescentes registradas." : record.status === "included" ? "Anexo incluído na prévia do PGR de trabalho. Não libera o serviço." : "Anexo salvo como rascunho. Avaliação e revisão humana pendentes." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar o anexo." }; }
}
