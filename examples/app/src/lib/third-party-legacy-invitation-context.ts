import "server-only";

import { createHash } from "node:crypto";
import { THIRD_PARTY_DOCUMENT_KINDS, type ThirdPartyDocumentKind } from "./third-party-policy";

export const LEGACY_INVITATION_CONTEXT_VERSION = "sst-m22-legacy-invitation-context-v1" as const;

export type LegacyInvitationContextInput = Readonly<{
  tenantId: string;
  invitationId: string;
  sourceCompanyId: string | null;
  sourceUnitId: string | null;
  contractorCnpj: string | null;
  scopeText: string | null;
  requestedCategories: readonly ThirdPartyDocumentKind[];
}>;

export type LegacyInvitationContextSnapshot = Readonly<{
  sourceCompanyId: string | null;
  sourceUnitId: string | null;
  contractorCnpj: string | null;
  scopeText: string | null;
  requestedCategories: readonly ThirdPartyDocumentKind[];
}>;

export type LegacyInvitationContextDigest = Readonly<{
  canonicalVersion: typeof LEGACY_INVITATION_CONTEXT_VERSION;
  contextSha256: string;
  snapshot: LegacyInvitationContextSnapshot;
}>;

const allowedCategories = new Set<string>(THIRD_PARTY_DOCUMENT_KINDS);

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Campo inválido no contexto do convite: ${field}.`);
  return value;
}

/**
 * Produz digest estável apenas dos campos de contexto admitidos pelo ledger.
 * Não incluir nomes, token/credencial, recibos, caminhos ou conteúdo de arquivo.
 * O array ordenado abaixo fixa a ordem canônica e JSON preserva null vs. "".
 */
export function buildLegacyInvitationContextDigest(
  input: LegacyInvitationContextInput,
): LegacyInvitationContextDigest {
  if (typeof input.tenantId !== "string" || !input.tenantId.trim()) {
    throw new Error("Tenant ausente no contexto do convite.");
  }
  if (typeof input.invitationId !== "string" || !input.invitationId.trim() || input.invitationId.length > 180) {
    throw new Error("ID de convite inválido no contexto legado.");
  }

  const sourceCompanyId = nullableString(input.sourceCompanyId, "sourceCompanyId");
  const sourceUnitId = nullableString(input.sourceUnitId, "sourceUnitId");
  const contractorCnpj = nullableString(input.contractorCnpj, "contractorCnpj");
  const scopeText = nullableString(input.scopeText, "scopeText");
  if (contractorCnpj !== null && (contractorCnpj.trim().length < 1 || contractorCnpj.trim().length > 32)) {
    throw new Error("CNPJ declarado inválido para o snapshot legado.");
  }
  if (!Array.isArray(input.requestedCategories) || input.requestedCategories.length === 0) {
    throw new Error("O convite precisa ter ao menos uma categoria solicitada.");
  }

  const requestedCategories = [...input.requestedCategories];
  if (requestedCategories.some((category) => !allowedCategories.has(category))) {
    throw new Error("Categoria solicitada não suportada pelo ledger legado.");
  }
  if (new Set(requestedCategories).size !== requestedCategories.length) {
    throw new Error("Categorias duplicadas no contexto do convite.");
  }
  requestedCategories.sort();

  const snapshot: LegacyInvitationContextSnapshot = Object.freeze({
    sourceCompanyId,
    sourceUnitId,
    contractorCnpj,
    scopeText,
    requestedCategories: Object.freeze(requestedCategories),
  });
  const canonicalTuple = [
    LEGACY_INVITATION_CONTEXT_VERSION,
    "third-party-json",
    input.tenantId,
    input.invitationId,
    snapshot.sourceCompanyId,
    snapshot.sourceUnitId,
    snapshot.contractorCnpj,
    snapshot.scopeText,
    snapshot.requestedCategories,
  ] as const;
  const canonicalUtf8 = JSON.stringify(canonicalTuple);
  const contextSha256 = createHash("sha256").update(canonicalUtf8, "utf8").digest("hex");

  return Object.freeze({
    canonicalVersion: LEGACY_INVITATION_CONTEXT_VERSION,
    contextSha256,
    snapshot,
  });
}
