"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { publishNr5Standard, saveNr5Draft, updateTermDates, type Nr5BandInput } from "@/lib/nr5-catalog-write";

// Server Actions da CIPA. Toda validação de forma acontece aqui, antes de chegar ao banco;
// as constraints do PostgreSQL continuam sendo a última palavra.

export type CipaFormState = { error?: string; success?: string };

const RISK_GRADES = [1, 2, 3, 4];

function text(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value.slice(0, max);
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Salva uma edição da NR-5 como rascunho, com as faixas do Quadro I informadas.
 * As faixas são digitadas pelo responsável técnico a partir da norma oficial — o sistema
 * não transcreve nem infere dimensionamento.
 */
export async function saveNr5DraftAction(_previous: CipaFormState, formData: FormData): Promise<CipaFormState> {
  const access = await getCurrentTenantAccess("operations.manage");
  if (!access.authenticated) return { error: "Sua sessão expirou. Entre novamente." };
  if (!access.context) return { error: "Seu perfil não pode administrar o catálogo da NR-5." };

  const edition = text(formData, "edition", 80);
  const issuingAct = text(formData, "issuingAct", 200);
  const validFrom = text(formData, "validFrom", 10);
  const sourceUrl = text(formData, "sourceUrl", 600);
  const sourceHash = text(formData, "sourceHash", 64).toLowerCase();

  if (!edition) return { error: "Informe a edição da norma (ex.: NR-05 atualizada 2022)." };
  if (!issuingAct) return { error: "Informe a portaria que publicou a edição." };
  if (!isValidDate(validFrom)) return { error: "Confira a data de início de vigência." };
  if (!/^[0-9a-f]{64}$/.test(sourceHash)) return { error: "O hash SHA-256 do arquivo da norma é obrigatório (64 caracteres hexadecimais)." };

  const bands: Nr5BandInput[] = [];
  for (const grade of RISK_GRADES) {
    const from = text(formData, `from-${grade}`, 10);
    const to = text(formData, `to-${grade}`, 10);
    const effective = text(formData, `effective-${grade}`, 6);
    const substitute = text(formData, `substitute-${grade}`, 6);
    const hasAny = [from, to, effective, substitute].some(Boolean);
    if (!hasAny) continue;
    if (!from || !effective || !substitute) {
      return { error: `Grau de risco ${grade}: informe a faixa inicial, os efetivos e os suplentes.` };
    }
    bands.push({
      id: `${slug(edition)}-g${grade}-${from}`,
      standardId: `nr5-${slug(edition)}`,
      riskGrade: grade,
      employeesFrom: Number(from),
      employeesTo: to ? Number(to) : null,
      effectiveMembers: Number(effective),
      substituteMembers: Number(substitute),
    });
  }
  if (bands.length === 0) return { error: "Informe ao menos uma faixa do Quadro I." };

  try {
    await saveNr5Draft({
      standard: {
        id: `nr5-${slug(edition)}`,
        edition,
        issuingAct,
        issuedAt: null,
        validFrom,
        sourceUrl,
        sourceHash,
      },
      bands,
      training: [],
      rules: [],
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar o rascunho do catálogo." };
  }

  revalidatePath("/cipa");
  return { success: `Rascunho da edição "${edition}" salvo. Publique depois de conferir a fonte.` };
}

/** Publica a edição conferida. O revisor é o responsável técnico que assina. */
export async function publishNr5Action(_previous: CipaFormState, formData: FormData): Promise<CipaFormState> {
  const access = await getCurrentTenantAccess("operations.manage");
  if (!access.authenticated) return { error: "Sua sessão expirou. Entre novamente." };
  if (!access.context) return { error: "Seu perfil não pode publicar o catálogo da NR-5." };

  const standardId = text(formData, "standardId", 100);
  const reviewer = text(formData, "reviewer", 160);
  const notes = text(formData, "notes", 2000);
  const method = text(formData, "method", 40) === "assisted_extraction" ? "assisted_extraction" : "manual_transcription";

  if (!standardId) return { error: "Escolha a edição a publicar." };
  if (reviewer.length < 3) return { error: "Informe quem conferiu a norma (nome do responsável técnico)." };
  if (notes.length < 10) return { error: "Descreva brevemente a conferência realizada (mínimo de 10 caracteres)." };

  try {
    await publishNr5Standard({ standardId, reviewer, notes, method });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível publicar a edição." };
  }

  revalidatePath("/cipa");
  return { success: "Edição publicada e registrada com revisor e data." };
}

/** Corrige a vigência de um mandato em rascunho ou vigente. */
export async function updateTermDatesAction(_previous: CipaFormState, formData: FormData): Promise<CipaFormState> {
  const access = await getCurrentTenantAccess("operations.manage");
  if (!access.authenticated) return { error: "Sua sessão expirou. Entre novamente." };
  if (!access.context) return { error: "Seu perfil não pode alterar mandatos de CIPA." };

  const termId = text(formData, "termId", 200);
  const endsOn = text(formData, "endsOn", 10);
  const possessionOn = text(formData, "possessionOn", 10);
  const reason = text(formData, "reason", 2000);

  if (!termId) return { error: "Mandato não identificado." };
  if (!isValidDate(endsOn)) return { error: "Confira a data de término do mandato." };
  if (possessionOn && !isValidDate(possessionOn)) return { error: "Confira a data de posse." };
  if (reason.length < 10) return { error: "Descreva o motivo da alteração (mínimo de 10 caracteres)." };

  try {
    await updateTermDates({ termId, endsOn, possessionOn: possessionOn || null, reason });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível atualizar o mandato." };
  }

  revalidatePath("/cipa");
  return { success: "Vigência do mandato atualizada e registrada na auditoria." };
}
