import { reconcileCurrentTenantRigorPolicyScopes } from "@/lib/third-party-rigor-postgres-read";
import { TenantTransactionAccessError } from "@/lib/tenant-read-transaction";

export async function GET() {
  try {
    const result = await reconcileCurrentTenantRigorPolicyScopes();
    const blockers = [
      ...result.errors,
      ...(result.policyCount === 0 ? ["POLICY_NOT_FOUND_FOR_TENANT"] : []),
      ...(result.policyCount > 0 && !result.policyHistoryAvailable ? ["POLICY_CHANGE_HISTORY_INCOMPLETE"] : []),
      "TRANSACTIONAL_SOURCE_ADAPTER_NOT_PREPARED",
    ];
    return Response.json(
      {
        status: result.errors.length === 0 ? "ok" : "needs_review",
        policyCount: result.policyCount,
        scopeMatches: result.scopeMatches,
        scopeMismatches: result.scopeMismatches,
        companiesWithAudit: result.companiesWithAudit,
        policyHistoryAvailable: result.policyHistoryAvailable,
        readyForImport: false,
        blockers,
        errors: result.errors,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof TenantTransactionAccessError) {
      return Response.json(
        { status: error.statusCode === 401 ? "unauthenticated" : "access_denied" },
        { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
