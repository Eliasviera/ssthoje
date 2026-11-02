import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmLegacyInvitationCaseLink,
  proposeLegacyInvitationCaseLink,
  type CapturedInvitationContext,
  type LegacyInvitationCaseConfirmationInput,
  type RecordedInvitationCaseLink,
  LegacyInvitationConfirmationError,
  type LegacyInvitationCaseLinkInput,
} from "../src/lib/third-party-legacy-invitation-confirmation.ts";
import {
  buildLegacyInvitationContextDigest,
  type LegacyInvitationContextDigest,
} from "../src/lib/third-party-legacy-invitation-context.ts";

const input: LegacyInvitationCaseLinkInput = {
  invitationId: "invitation-synthetic",
  expectedContextSha256: "a".repeat(64),
  expectedRevision: 0,
  companyId: "company-synthetic",
  unitId: "unit-synthetic",
  thirdPartyId: "00000000-0000-4000-8000-000000000001",
  workflowId: "00000000-0000-4000-8000-000000000002",
  rationale: "Confirmação humana sintética.",
};

type ProposalDependencies = Parameters<typeof proposeLegacyInvitationCaseLink>[1];
type ConfirmationDependencies = Parameters<typeof confirmLegacyInvitationCaseLink>[1];

const context = buildLegacyInvitationContextDigest({
  tenantId: "tenant-synthetic",
  invitationId: input.invitationId,
  sourceCompanyId: input.companyId,
  sourceUnitId: input.unitId,
  contractorCnpj: null,
  scopeText: "Escopo sintético",
  requestedCategories: ["PGR"],
});

function proposalDependencies(overrides: Partial<ProposalDependencies> = {}) {
  const calls: string[] = [];
  const defaults: ProposalDependencies = {
    tenantId: "tenant-synthetic",
    async readCurrentContext(tenantId: string, invitationId: string): Promise<LegacyInvitationContextDigest> {
      calls.push("read");
      assert.equal(tenantId, "tenant-synthetic");
      assert.equal(invitationId, input.invitationId);
      return context;
    },
    async captureContext(value: LegacyInvitationContextDigest): Promise<CapturedInvitationContext> {
      calls.push("capture");
      assert.equal(value.contextSha256, context.contextSha256);
      return { snapshotId: "00000000-0000-4000-8000-000000000003", contextSha256: value.contextSha256 };
    },
    async recordLink(snapshot: CapturedInvitationContext, confirmation: LegacyInvitationCaseLinkInput): Promise<RecordedInvitationCaseLink> {
      calls.push("link");
      assert.equal(snapshot.contextSha256, context.contextSha256);
      assert.equal(confirmation.invitationId, input.invitationId);
      assert.equal(confirmation.expectedContextSha256, context.contextSha256);
      return { eventId: "00000000-0000-4000-8000-000000000004", revision: 1, inserted: true };
    },
  };
  return {
    calls,
    dependencies: { ...defaults, ...overrides },
  };
}

test("proposal re-reads source, captures the reviewed snapshot, then proposes the exact case", async () => {
  const fixture = proposalDependencies();
  const result = await proposeLegacyInvitationCaseLink(
    { ...input, expectedContextSha256: context.contextSha256 },
    fixture.dependencies,
  );
  assert.deepEqual(fixture.calls, ["read", "capture", "link"]);
  assert.equal(result.revision, 1);
  assert.equal(result.inserted, true);
});

test("proposal context drift aborts before any snapshot or link is written", async () => {
  const fixture = proposalDependencies();
  await assert.rejects(
    proposeLegacyInvitationCaseLink(input, fixture.dependencies),
    (error) => error instanceof LegacyInvitationConfirmationError && error.kind === "context_changed",
  );
  assert.deepEqual(fixture.calls, ["read"]);
});

test("missing invitation is not converted into an empty or successful proposal", async () => {
  const fixture = proposalDependencies({
    async readCurrentContext() {
      fixture.calls.push("read");
      return null;
    },
  });
  await assert.rejects(
    proposeLegacyInvitationCaseLink({ ...input, expectedContextSha256: context.contextSha256 }, fixture.dependencies),
    (error) => error instanceof LegacyInvitationConfirmationError && error.kind === "not_found",
  );
  assert.deepEqual(fixture.calls, ["read"]);
});

test("capture response with a different digest aborts before proposing", async () => {
  const fixture = proposalDependencies({
    async readCurrentContext() { return context; },
    async captureContext() {
      fixture.calls.push("capture");
      return { snapshotId: "00000000-0000-4000-8000-000000000003", contextSha256: "b".repeat(64) };
    },
  });
  await assert.rejects(
    proposeLegacyInvitationCaseLink({ ...input, expectedContextSha256: context.contextSha256 }, fixture.dependencies),
    (error) => error instanceof LegacyInvitationConfirmationError && error.kind === "capture_conflict",
  );
  assert.deepEqual(fixture.calls, ["capture"]);
});

test("invalid case target is rejected before reading the invitation", async () => {
  const fixture = proposalDependencies();
  await assert.rejects(
    proposeLegacyInvitationCaseLink({ ...input, workflowId: "not-a-uuid" }, fixture.dependencies),
    (error) => error instanceof LegacyInvitationConfirmationError && error.kind === "invalid_input",
  );
  assert.deepEqual(fixture.calls, []);
});

function confirmationDependencies(
  overrides: Partial<ConfirmationDependencies> = {},
) {
  const calls: string[] = [];
  const defaults: ConfirmationDependencies = {
    tenantId: "tenant-synthetic",
    async readCurrentContext(tenantId: string, invitationId: string): Promise<LegacyInvitationContextDigest> {
      calls.push("read");
      assert.equal(tenantId, "tenant-synthetic");
      assert.equal(invitationId, input.invitationId);
      return context;
    },
    async recordLink(snapshot, confirmation) {
      calls.push("link");
      assert.equal(snapshot.snapshotId, confirmation.snapshotId);
      assert.equal(snapshot.contextSha256, context.contextSha256);
      assert.equal(confirmation.expectedContextSha256, context.contextSha256);
      return { eventId: "00000000-0000-4000-8000-000000000004", revision: 3, inserted: true };
    },
  };
  return { calls, dependencies: { ...defaults, ...overrides } };
}

test("client confirmation re-reads source and links only the exact captured proposal", async () => {
  const fixture = confirmationDependencies();
  const confirmation: LegacyInvitationCaseConfirmationInput = {
    ...input,
    expectedContextSha256: context.contextSha256,
    snapshotId: "00000000-0000-4000-8000-000000000003",
  };
  const result = await confirmLegacyInvitationCaseLink(confirmation, fixture.dependencies);
  assert.deepEqual(fixture.calls, ["read", "link"]);
  assert.equal(result.revision, 3);
});

test("client confirmation rejects source drift before recording the link", async () => {
  const fixture = confirmationDependencies({
    async readCurrentContext() {
      fixture.calls.push("read");
      return buildLegacyInvitationContextDigest({
        tenantId: "tenant-synthetic",
        invitationId: input.invitationId,
        sourceCompanyId: input.companyId,
        sourceUnitId: input.unitId,
        contractorCnpj: null,
        scopeText: "Escopo alterado",
        requestedCategories: ["PGR"],
      });
    },
  });
  const confirmation: LegacyInvitationCaseConfirmationInput = {
    ...input,
    expectedContextSha256: context.contextSha256,
    snapshotId: "00000000-0000-4000-8000-000000000003",
  };
  await assert.rejects(
    confirmLegacyInvitationCaseLink(confirmation, fixture.dependencies),
    (error) => error instanceof LegacyInvitationConfirmationError && error.kind === "context_changed",
  );
  assert.deepEqual(fixture.calls, ["read"]);
});
