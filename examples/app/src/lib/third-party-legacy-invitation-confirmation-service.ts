import "server-only";

import type { PoolClient } from "pg";
import { assertCurrentTenantMembershipParity } from "./tenant-read-transaction";
import type { TenantWriteContext } from "./tenant-write-operations";
import {
  LegacyInvitationConfirmationError,
  confirmLegacyInvitationCaseLink,
  proposeLegacyInvitationCaseLink,
  type LegacyInvitationCaseConfirmationInput,
  type LegacyInvitationCaseLinkInput,
} from "./third-party-legacy-invitation-confirmation";
import { readCurrentLegacyInvitationContext } from "./third-party-legacy-invitation-preview";
import {
  withCurrentClientRegistrarConfirmationWork,
  withCurrentThirdPartyReconciliationWork,
} from "./third-party-legacy-reconciliation-transaction";

const CAPTURE_INVITATION_CONTEXT = `
  SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(
    $1,$2,$3,$4,$5,$6,$7,$8
  )
`;
const RECORD_INVITATION_CASE_LINK = `
  SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(
    $1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,$9
  )
`;

type CaptureRow = { snapshot_id: string; context_sha256: string };
type LinkRow = { event_id: string; revision: number; inserted: boolean };
type LinkStateRow = { revision: number; event_type: string };

function oneRow<T>(rows: T[]): T {
  if (rows.length !== 1) throw new Error("A função candidata retornou uma resposta inesperada.");
  return rows[0];
}

async function recordLink(
  client: PoolClient,
  state: "pending" | "proposed" | "linked",
  snapshotId: string,
  contextSha256: string,
  input: LegacyInvitationCaseLinkInput,
  expectedRevision = input.expectedRevision,
  rationale = input.rationale,
): Promise<{ eventId: string; revision: number; inserted: boolean }> {
  const result = await client.query<LinkRow>(RECORD_INVITATION_CASE_LINK, [
    snapshotId,
    contextSha256,
    expectedRevision,
    state,
    state === "pending" ? null : input.companyId,
    state === "pending" ? null : input.unitId,
    state === "pending" ? null : input.thirdPartyId,
    state === "pending" ? null : input.workflowId,
    rationale,
  ]);
  const row = oneRow(result.rows);
  return { eventId: row.event_id, revision: row.revision, inserted: row.inserted };
}

async function proposeInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  input: LegacyInvitationCaseLinkInput,
) {
  await assertCurrentTenantMembershipParity(client, {
    userId: context.userId,
    tenantId: context.tenantId,
    membershipRole: context.role,
  });

  return proposeLegacyInvitationCaseLink(input, {
    tenantId: context.tenantId,
    readCurrentContext: async (tenantId, invitationId) => readCurrentLegacyInvitationContext(tenantId, invitationId),
    captureContext: async (digest) => {
      const result = await client.query<CaptureRow>(CAPTURE_INVITATION_CONTEXT, [
        input.invitationId,
        input.expectedContextSha256,
        digest.contextSha256,
        digest.snapshot.sourceCompanyId,
        digest.snapshot.sourceUnitId,
        digest.snapshot.contractorCnpj,
        digest.snapshot.scopeText,
        digest.snapshot.requestedCategories,
      ]);
      const row = oneRow(result.rows);
      return { snapshotId: row.snapshot_id, contextSha256: row.context_sha256 };
    },
    recordLink: async (snapshot, proposal) => {
      const stateResult = await client.query<LinkStateRow>(
        "SELECT revision, event_type FROM third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states($1::text[])",
        [[input.invitationId]],
      );
      const latest = stateResult.rows[0];
      if (latest && latest.revision !== input.expectedRevision) {
        throw new LegacyInvitationConfirmationError("capture_conflict");
      }
      if (!latest && input.expectedRevision !== 0) {
        throw new LegacyInvitationConfirmationError("capture_conflict");
      }

      let proposalRevision = latest?.revision ?? 0;
      if (!latest || latest.event_type === "unavailable") {
        await recordLink(
          client,
          "pending",
          snapshot.snapshotId,
          snapshot.contextSha256,
          { ...proposal, expectedRevision: proposalRevision },
          proposalRevision,
          "Contexto capturado para revisão humana.",
        );
        proposalRevision += 1;
      } else if (!["pending", "ambiguous", "reopened"].includes(latest.event_type)) {
        throw new LegacyInvitationConfirmationError("capture_conflict");
      }

      return recordLink(
        client,
        "proposed",
        snapshot.snapshotId,
        snapshot.contextSha256,
        { ...proposal, expectedRevision: proposalRevision },
        proposalRevision,
      );
    },
  });
}

async function confirmInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  input: LegacyInvitationCaseConfirmationInput,
) {
  return confirmLegacyInvitationCaseLink(input, {
    tenantId: context.tenantId,
    readCurrentContext: async (tenantId, invitationId) => readCurrentLegacyInvitationContext(tenantId, invitationId),
    recordLink: async (snapshot, confirmation) =>
      recordLink(client, "linked", snapshot.snapshotId, snapshot.contextSha256, confirmation),
  });
}

export async function proposeCurrentLegacyInvitationCaseLink(input: LegacyInvitationCaseLinkInput) {
  return withCurrentThirdPartyReconciliationWork(undefined, (client, context) =>
    proposeInTransaction(client, context, input),
  );
}

export async function confirmCurrentLegacyInvitationCaseLink(input: LegacyInvitationCaseConfirmationInput) {
  return withCurrentClientRegistrarConfirmationWork((client, context) =>
    confirmInTransaction(client, context, input),
  );
}
