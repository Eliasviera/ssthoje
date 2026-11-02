import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import {
  assertCurrentTenantMembershipParity,
  TenantTransactionAccessError,
  withCurrentTenantReadTransaction,
} from "./tenant-read-transaction";
import {
  buildLegacyInvitationContextDigest,
  type LegacyInvitationContextInput,
} from "./third-party-legacy-invitation-context";

type LegacyInvitationRecord = Record<string, unknown>;
type LegacyInvitationDatabase = { invitations?: unknown };

export class LegacyInvitationPreviewError extends Error {
  constructor(readonly kind: "unavailable" | "invalid_source") {
    super(kind === "unavailable" ? "A origem legada está indisponível." : "O contexto legado precisa de revisão.");
    this.name = "LegacyInvitationPreviewError";
  }
}

function isRecord(value: unknown): value is LegacyInvitationRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredNullableString(record: LegacyInvitationRecord, key: string): string | null {
  const value = record[key];
  if (value === null || typeof value === "string") return value;
  throw new LegacyInvitationPreviewError("invalid_source");
}

function contextInput(record: LegacyInvitationRecord, tenantId: string, invitationId: string): LegacyInvitationContextInput {
  if (!Array.isArray(record.requested)) throw new LegacyInvitationPreviewError("invalid_source");
  const scopeText = record.scope === undefined ? null : requiredNullableString(record, "scope");
  return {
    tenantId,
    invitationId,
    sourceCompanyId: requiredNullableString(record, "companyId"),
    sourceUnitId: requiredNullableString(record, "unitId"),
    contractorCnpj: requiredNullableString(record, "contractorCnpj"),
    scopeText,
    requestedCategories: record.requested as LegacyInvitationContextInput["requestedCategories"],
  };
}

export function readCurrentLegacyInvitationContext(tenantId: string, invitationId: string) {
  let source: LegacyInvitationDatabase;
  try {
    source = JSON.parse(readFileSync(join(process.cwd(), "data", "third-party.json"), "utf8")) as LegacyInvitationDatabase;
  } catch {
    throw new LegacyInvitationPreviewError("unavailable");
  }
  if (!isRecord(source) || !Array.isArray(source.invitations)) {
    throw new LegacyInvitationPreviewError("invalid_source");
  }

  const invitation = source.invitations.find((candidate) =>
    isRecord(candidate) && candidate.id === invitationId && candidate.tenantId === tenantId,
  );
  if (!isRecord(invitation)) return null;

  try {
    return buildLegacyInvitationContextDigest(contextInput(invitation, tenantId, invitationId));
  } catch {
    throw new LegacyInvitationPreviewError("invalid_source");
  }
}

/** Read-only preview for a human reviewer. This does not capture an event or lock the JSON source. */
export async function previewLegacyInvitationContext(invitationId: string) {
  return withCurrentTenantReadTransaction("documents.review", undefined, async (client: PoolClient, context) => {
    if (!hasTenantPermission(context.membershipRole, "thirdparty.read") || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);

    const digest = readCurrentLegacyInvitationContext(context.tenantId, invitationId);
    if (!digest) return null;
    return Object.freeze({
      sourceStore: "third-party-json" as const,
      invitationId,
      captureStatus: "preview_only" as const,
      persisted: false as const,
      ...digest,
    });
  });
}
