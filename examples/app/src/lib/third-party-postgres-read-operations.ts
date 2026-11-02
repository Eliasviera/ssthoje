import type { PoolClient } from "pg";
import type { InvitationSummary } from "./third-party-store";
import { validateThirdPartySource } from "./third-party-source-contract.mjs";

type Row = { tenant_id: string; id: string; invitation_id?: string; issue_id?: string; approval_id?: string; payload: Record<string, unknown> };
const tables = ["invitation", "receipt", "issue", "issue_event", "approval", "schedule"] as const;
const invalid = () => new Error("Snapshot de Terceiros inválido; leitura interrompida.");

// Recebe tenant exclusivamente do wrapper autenticado. Não resolve convites públicos.
export async function listThirdPartySnapshotsInTransaction(client: PoolClient, tenantId: string, now = new Date()): Promise<InvitationSummary[]> {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(tenantId) || !Number.isFinite(now.getTime())) throw invalid();
  const rows = new Map<string, Row[]>();
  for (const table of tables) {
    // Nomes são constantes do módulo; valores de escopo são parametrizados.
    const result = await client.query<Row>(`SELECT * FROM sst.third_party_${table}_snapshots WHERE tenant_id = $1 ORDER BY source_order, id`, [tenantId]);
    const ids = new Set<string>();
    for (const row of result.rows) {
      if (row.tenant_id !== tenantId || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload) || row.payload.id !== row.id || ids.has(row.id)) throw invalid();
      ids.add(row.id);
    }
    rows.set(table, result.rows);
  }
  const invitations = new Map<string, Record<string, unknown>>();
  for (const row of rows.get("invitation")!) {
    if (row.payload.tenantId !== tenantId || "receipts" in row.payload || "issues" in row.payload) throw invalid();
    invitations.set(row.id, { ...structuredClone(row.payload), receipts: [], issues: [] });
  }
  const issues = new Map<string, { invitationId: string; payload: Record<string, unknown> }>();
  for (const row of rows.get("receipt")!) {
    const parent = invitations.get(row.invitation_id ?? "");
    if (!parent) throw invalid();
    (parent.receipts as unknown[]).push(structuredClone(row.payload));
  }
  for (const row of rows.get("issue")!) {
    const parent = invitations.get(row.invitation_id ?? "");
    if (!parent || "events" in row.payload) throw invalid();
    const payload = { ...structuredClone(row.payload), events: [] };
    issues.set(row.id, { invitationId: row.invitation_id!, payload });
    (parent.issues as unknown[]).push(payload);
  }
  for (const row of rows.get("issue_event")!) {
    const parent = issues.get(row.issue_id ?? "");
    if (!parent || parent.invitationId !== row.invitation_id) throw invalid();
    (parent.payload.events as unknown[]).push(structuredClone(row.payload));
  }
  for (const table of ["approval", "schedule"] as const) {
    for (const row of rows.get(table)!) {
      if (row.payload.tenantId !== tenantId || row.payload.invitationId !== row.invitation_id || !invitations.has(row.invitation_id ?? "")) throw invalid();
      if (table === "schedule" && (row.payload.approvalId !== row.approval_id || !rows.get("approval")!.some(approval => approval.id === row.approval_id && approval.invitation_id === row.invitation_id))) throw invalid();
    }
  }
  const source = { invitations: [...invitations.values()], integrationApprovals: rows.get("approval")!.map(row => row.payload), integrationSchedules: rows.get("schedule")!.map(row => row.payload) };
  if (validateThirdPartySource(source).blockers) throw invalid();
  // Projeção explícita: tokenHash/storageName nunca saem desta operação.
  return source.invitations.map(value => {
    const invite = value as unknown as InvitationSummary;
    return {
      id: invite.id, companyId: invite.companyId, unitId: invite.unitId, companyName: invite.companyName, unitName: invite.unitName,
      relatedCnpj: invite.relatedCnpj, contractorName: invite.contractorName, contractorCnpj: invite.contractorCnpj,
      scope: invite.scope, requested: [...invite.requested], medicalAsoRequired: invite.medicalAsoRequired ?? false,
      createdAt: invite.createdAt, expiresAt: invite.expiresAt, revokedAt: invite.revokedAt,
      linkStatus: invite.revokedAt ? "revoked" : Date.parse(invite.expiresAt) <= now.getTime() ? "expired" : "active",
      issues: structuredClone(invite.issues ?? []), receipts: invite.receipts.map(receipt => ({ id: receipt.id, kind: receipt.kind, fileName: receipt.fileName,
        size: receipt.size, digest: receipt.digest, receivedAt: receipt.receivedAt, validUntil: receipt.validUntil,
        replacesReceiptId: receipt.replacesReceiptId, issueId: receipt.issueId })),
    };
  });
}
