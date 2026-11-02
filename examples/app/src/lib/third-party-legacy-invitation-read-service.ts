import "server-only";

import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import {
  assertCurrentTenantMembershipParity,
  TenantTransactionAccessError,
  withCurrentTenantReadTransaction,
} from "./tenant-read-transaction";

export type LegacyInvitationCaseOption = Readonly<{
  caseId: string;
  companyId: string;
  unitId: string;
  thirdPartyId: string;
  workScope: string;
}>;

export type LegacyInvitationCaseLinkState = Readonly<{
  invitationId: string;
  eventId: string;
  snapshotId: string;
  contextSha256: string;
  revision: number;
  eventType: "pending" | "proposed" | "linked" | "ambiguous" | "rejected" | "unavailable" | "reopened";
  companyId: string | null;
  unitId: string | null;
  thirdPartyId: string | null;
  workflowId: string | null;
  rationale: string;
  occurredAt: string;
}>;

export type ClientRegistrarInvitationProposal = Readonly<{
  invitationId: string;
  eventId: string;
  snapshotId: string;
  contextSha256: string;
  revision: number;
  companyId: string;
  unitId: string;
  thirdPartyId: string;
  workflowId: string;
  rationale: string;
  occurredAt: string;
}>;

type CaseRow = {
  case_id: string;
  company_id: string;
  unit_id: string;
  third_party_id: string;
  work_scope: string;
};
type LinkStateRow = {
  source_invitation_id: string;
  event_id: string;
  snapshot_id: string;
  context_sha256: string;
  revision: number;
  event_type: LegacyInvitationCaseLinkState["eventType"];
  company_id: string | null;
  unit_id: string | null;
  third_party_id: string | null;
  workflow_id: string | null;
  rationale: string;
  occurred_at: Date | string;
};
type ProposalRow = Omit<LinkStateRow, "event_type"> & {
  company_id: string;
  unit_id: string;
  third_party_id: string;
  workflow_id: string;
};

function canReviewThirdParty(role: string) {
  return hasTenantPermission(role, "documents.review")
    && hasTenantPermission(role, "thirdparty.read");
}

export async function listCurrentLegacyInvitationCaseOptions() {
  return withCurrentTenantReadTransaction("documents.review", undefined, async (client, context) => {
    if (!canReviewThirdParty(context.membershipRole) || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);
    const result = await client.query<CaseRow>(
      "SELECT * FROM third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()",
    );
    return result.rows.map((row) => Object.freeze({
      caseId: row.case_id,
      companyId: row.company_id,
      unitId: row.unit_id,
      thirdPartyId: row.third_party_id,
      workScope: row.work_scope,
    }));
  });
}

export async function listCurrentLegacyInvitationCaseStates(invitationIds: readonly string[]) {
  if (!invitationIds.length) return [] as LegacyInvitationCaseLinkState[];
  if (invitationIds.length > 500 || invitationIds.some((id) => !id.trim() || id.length > 180)) {
    throw new Error("A lista de convites para consulta excede os limites permitidos.");
  }

  return withCurrentTenantReadTransaction("documents.review", undefined, async (client, context) => {
    if (!canReviewThirdParty(context.membershipRole) || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);
    const result = await client.query<LinkStateRow>(
      "SELECT * FROM third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states($1::text[])",
      [invitationIds],
    );
    return result.rows.map((row) => Object.freeze({
      invitationId: row.source_invitation_id,
      eventId: row.event_id,
      snapshotId: row.snapshot_id,
      contextSha256: row.context_sha256,
      revision: row.revision,
      eventType: row.event_type,
      companyId: row.company_id,
      unitId: row.unit_id,
      thirdPartyId: row.third_party_id,
      workflowId: row.workflow_id,
      rationale: row.rationale,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    }));
  });
}

export async function listCurrentClientRegistrarInvitationProposals() {
  return withCurrentTenantReadTransaction("documents.read", undefined, async (client, context) => {
    if (context.membershipRole !== "cliente" || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);
    const result = await client.query<ProposalRow>(
      "SELECT * FROM third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()",
    );
    return result.rows.map((row) => Object.freeze({
      invitationId: row.source_invitation_id,
      eventId: row.event_id,
      snapshotId: row.snapshot_id,
      contextSha256: row.context_sha256,
      revision: row.revision,
      companyId: row.company_id,
      unitId: row.unit_id,
      thirdPartyId: row.third_party_id,
      workflowId: row.workflow_id,
      rationale: row.rationale,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    }));
  });
}
