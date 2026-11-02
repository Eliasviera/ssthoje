import "server-only";

import type { PoolClient } from "pg";
import { hasTenantPermission, type TenantPermission, type TenantRole } from "./tenant-access";
import { executeTenantWriteTransaction, type TenantWriteContext } from "./tenant-write-operations";

export class ThirdPartyReconciliationAccessError extends Error {
  readonly statusCode: 401 | 403;

  constructor(statusCode: 401 | 403) {
    super(statusCode === 401 ? "Autenticação obrigatória." : "Acesso à reconciliação de terceiros negado.");
    this.name = "ThirdPartyReconciliationAccessError";
    this.statusCode = statusCode;
  }
}

export function assertThirdPartyReconciliationRole(role: TenantRole): void {
  const permissions: TenantPermission[] = ["documents.review", "thirdparty.read"];
  if (!permissions.every((permission) => hasTenantPermission(role, permission))) {
    throw new ThirdPartyReconciliationAccessError(403);
  }
}

export type ThirdPartyReconciliationCandidateCall =
  | Readonly<{
      kind: "capture_invitation_context";
      args: readonly [string, string, string, string | null, string | null, string | null, string, readonly string[]];
    }>
  | Readonly<{
      kind: "record_invitation_case_link";
      args: readonly [string, string, number, string, string | null, string | null, string | null, string | null, string];
    }>
  | Readonly<{
      kind: "capture_legacy_receipt";
      args: readonly [string, string, number, string, string, string, string, number, string, string | null, string | null, string, string, string];
    }>
  | Readonly<{
      kind: "record_receipt_reconciliation";
      args: readonly [string, string, number, string, string | null, string];
    }>;

function candidateStatement(call: ThirdPartyReconciliationCandidateCall): string {
  switch (call.kind) {
    case "capture_invitation_context":
      return "SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context($1,$2,$3,$4,$5,$6,$7,$8)";
    case "record_invitation_case_link":
      return "SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link($1,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,$9)";
    case "capture_legacy_receipt":
      return "SELECT * FROM third_party_legacy_reconciliation_candidate.capture_legacy_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::date,$11,$12::uuid,$13,$14)";
    case "record_receipt_reconciliation":
      return "SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation($1::uuid,$2,$3,$4,$5::uuid,$6)";
    default:
      throw new Error("Operação de reconciliação não permitida.");
  }
}

export async function executeThirdPartyReconciliationTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  call: ThirdPartyReconciliationCandidateCall,
): Promise<unknown> {
  assertThirdPartyReconciliationRole(context.role);
  const statement = candidateStatement(call);
  return executeTenantWriteTransaction(client, context, async (transaction, trustedContext) => {
    await transaction.query("SELECT set_config('sst.membership_role', $1, true)", [trustedContext.role]);
    return transaction.query(statement, [...call.args]);
  });
}
