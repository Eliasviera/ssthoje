import { TenantTransactionAccessError } from "@/lib/tenant-read-transaction";
import { LegacyInvitationPreviewError, previewLegacyInvitationContext } from "@/lib/third-party-legacy-invitation-preview";

export async function GET(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    const { invitationId } = await params;
    const preview = await previewLegacyInvitationContext(invitationId);
    if (!preview) return Response.json({ status: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return Response.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TenantTransactionAccessError) {
      return Response.json(
        { status: error.statusCode === 401 ? "unauthenticated" : "access_denied" },
        { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (error instanceof LegacyInvitationPreviewError) {
      const status = error.kind === "invalid_source" ? 409 : 503;
      return Response.json(
        { status: error.kind === "invalid_source" ? "needs_review" : "unavailable" },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
