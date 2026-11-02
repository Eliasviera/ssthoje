import type { LegacyInvitationContextDigest } from "./third-party-legacy-invitation-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export type LegacyInvitationCaseLinkInput = Readonly<{
  invitationId: string;
  expectedContextSha256: string;
  expectedRevision: number;
  companyId: string;
  unitId: string;
  thirdPartyId: string;
  workflowId: string;
  rationale: string;
}>;

export type LegacyInvitationCaseConfirmationInput = LegacyInvitationCaseLinkInput & Readonly<{
  snapshotId: string;
}>;

export type CapturedInvitationContext = Readonly<{
  snapshotId: string;
  contextSha256: string;
}>;

export type RecordedInvitationCaseLink = Readonly<{
  eventId: string;
  revision: number;
  inserted: boolean;
}>;

export type ProposedInvitationCaseLink = RecordedInvitationCaseLink & CapturedInvitationContext;

export class LegacyInvitationConfirmationError extends Error {
  readonly kind: "invalid_input" | "not_found" | "context_changed" | "capture_conflict";

  constructor(kind: LegacyInvitationConfirmationError["kind"]) {
    super("A confirmação do vínculo do convite não pôde ser concluída.");
    this.name = "LegacyInvitationConfirmationError";
    this.kind = kind;
  }
}

function validateInput(input: LegacyInvitationCaseLinkInput): void {
  if (
    !input.invitationId.trim()
    || input.invitationId.length > 180
    || !SHA256.test(input.expectedContextSha256)
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || !input.companyId.trim()
    || !input.unitId.trim()
    || !UUID.test(input.thirdPartyId)
    || !UUID.test(input.workflowId)
    || !input.rationale.trim()
    || input.rationale.trim().length > 1600
  ) {
    throw new LegacyInvitationConfirmationError("invalid_input");
  }
}

export async function proposeLegacyInvitationCaseLink(
  input: LegacyInvitationCaseLinkInput,
  dependencies: Readonly<{
    tenantId: string;
    readCurrentContext: (tenantId: string, invitationId: string) => Promise<LegacyInvitationContextDigest | null>;
    captureContext: (context: LegacyInvitationContextDigest) => Promise<CapturedInvitationContext>;
    recordLink: (
      snapshot: CapturedInvitationContext,
      input: LegacyInvitationCaseLinkInput,
    ) => Promise<RecordedInvitationCaseLink>;
  }>,
): Promise<ProposedInvitationCaseLink> {
  validateInput(input);

  const current = await dependencies.readCurrentContext(dependencies.tenantId, input.invitationId);
  if (!current) throw new LegacyInvitationConfirmationError("not_found");
  if (current.contextSha256 !== input.expectedContextSha256) {
    throw new LegacyInvitationConfirmationError("context_changed");
  }

  const captured = await dependencies.captureContext(current);
  if (
    !UUID.test(captured.snapshotId)
    || captured.contextSha256 !== current.contextSha256
  ) {
    throw new LegacyInvitationConfirmationError("capture_conflict");
  }
  const recorded = await dependencies.recordLink(captured, input);
  return { ...captured, ...recorded };
}

export async function confirmLegacyInvitationCaseLink(
  input: LegacyInvitationCaseConfirmationInput,
  dependencies: Readonly<{
    tenantId: string;
    readCurrentContext: (tenantId: string, invitationId: string) => Promise<LegacyInvitationContextDigest | null>;
    recordLink: (
      snapshot: CapturedInvitationContext,
      input: LegacyInvitationCaseConfirmationInput,
    ) => Promise<RecordedInvitationCaseLink>;
  }>,
): Promise<RecordedInvitationCaseLink> {
  validateInput(input);
  if (!UUID.test(input.snapshotId)) throw new LegacyInvitationConfirmationError("invalid_input");

  const current = await dependencies.readCurrentContext(dependencies.tenantId, input.invitationId);
  if (!current) throw new LegacyInvitationConfirmationError("not_found");
  if (current.contextSha256 !== input.expectedContextSha256) {
    throw new LegacyInvitationConfirmationError("context_changed");
  }
  return dependencies.recordLink(
    { snapshotId: input.snapshotId, contextSha256: current.contextSha256 },
    input,
  );
}
