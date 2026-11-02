import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { loadAdminPostgresConfig } from "./postgres-env.mjs";
import { analyzeThirdPartyMigration } from "../src/lib/third-party-migration-analysis.mjs";
import { analyzeThirdPartyFiles } from "../src/lib/third-party-file-analysis.mjs";
import { validateThirdPartySource } from "../src/lib/third-party-source-contract.mjs";
import { validateThirdPartyAuxiliarySources } from "../src/lib/third-party-auxiliary-contract.mjs";

const { Pool } = pg;
const sourceNames = ["third-party.json", "clients.json", "compliance.json", "documents.json", "audit-log.jsonl"];
const tableSpecs = [
  { key: "invitation", table: "third_party_invitation_snapshots", columns: ["tenant_id", "id", "company_id", "unit_id", "source_order", "payload"] },
  { key: "receipt", table: "third_party_receipt_snapshots", columns: ["tenant_id", "invitation_id", "id", "source_order", "payload"] },
  { key: "issue", table: "third_party_issue_snapshots", columns: ["tenant_id", "invitation_id", "id", "original_receipt_id", "current_receipt_id", "source_order", "payload"] },
  { key: "issue_event", table: "third_party_issue_event_snapshots", columns: ["tenant_id", "invitation_id", "issue_id", "id", "receipt_id", "source_order", "payload"] },
  { key: "approval", table: "third_party_approval_snapshots", columns: ["tenant_id", "invitation_id", "id", "source_order", "payload"] },
  { key: "schedule", table: "third_party_schedule_snapshots", columns: ["tenant_id", "invitation_id", "approval_id", "id", "source_order", "payload"] },
  { key: "audit", table: "third_party_audit_snapshots", columns: ["tenant_id", "id", "source_order", "payload"] },
];
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
const emptyRows = () => Object.fromEntries(tableSpecs.map(spec => [spec.key, []]));

export function buildThirdPartySnapshotRows(source, audit) {
  const rows = emptyRows();
  for (const [sourceOrder, invite] of (source.invitations ?? []).entries()) {
    const invitation = { ...invite };
    delete invitation.receipts; delete invitation.issues;
    rows.invitation.push({ tenant_id: invite.tenantId, id: invite.id, company_id: invite.companyId, unit_id: invite.unitId, source_order: sourceOrder, payload: invitation });
    for (const [order, receipt] of (invite.receipts ?? []).entries()) rows.receipt.push({ tenant_id: invite.tenantId, invitation_id: invite.id, id: receipt.id, source_order: order, payload: receipt });
    for (const [order, issue] of (invite.issues ?? []).entries()) {
      const { events = [], ...payload } = issue;
      rows.issue.push({ tenant_id: invite.tenantId, invitation_id: invite.id, id: issue.id, original_receipt_id: issue.originalReceiptId, current_receipt_id: issue.currentReceiptId, source_order: order, payload });
      for (const [eventOrder, event] of events.entries()) rows.issue_event.push({ tenant_id: invite.tenantId, invitation_id: invite.id, issue_id: issue.id, id: event.id, receipt_id: event.receiptId, source_order: eventOrder, payload: event });
    }
  }
  for (const [sourceOrder, approval] of (source.integrationApprovals ?? []).entries()) rows.approval.push({ tenant_id: approval.tenantId, invitation_id: approval.invitationId, id: approval.id, source_order: sourceOrder, payload: approval });
  for (const [sourceOrder, schedule] of (source.integrationSchedules ?? []).entries()) rows.schedule.push({ tenant_id: schedule.tenantId, invitation_id: schedule.invitationId, approval_id: schedule.approvalId, id: schedule.id, source_order: sourceOrder, payload: schedule });
  for (const [sourceOrder, event] of audit.entries()) if (typeof event?.action === "string" && event.action.startsWith("thirdparty.")) rows.audit.push({ tenant_id: event.tenantId, id: event.id, source_order: sourceOrder, payload: event });
  return rows;
}

export function reconcileThirdPartySnapshotRows(expected, actual) {
  const normalized = rows => [...rows].sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return tableSpecs.every(spec => canonical(normalized(expected[spec.key])) === canonical(normalized(actual[spec.key])));
}
export function thirdPartySnapshotRowMismatches(expected, actual) {
  return tableSpecs.filter(spec => canonical([...expected[spec.key]].sort((a,b)=>canonical(a).localeCompare(canonical(b)))) !== canonical([...actual[spec.key]].sort((a,b)=>canonical(a).localeCompare(canonical(b))))).map(spec => spec.key);
}

async function readSnapshot(identity) {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("INVALID_SNAPSHOT_ID");
  const folder = join(process.cwd(), "data", "third-party-migration-snapshots", identity);
  const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.identity !== identity || manifest.sourceStableDuringCapture !== true) throw new Error("INVALID_SNAPSHOT_MANIFEST");
  const buffers = await Promise.all(sourceNames.map(async name => {
    if (manifest.sourcePresence?.[name] !== true) {
      if (name !== "documents.json" || manifest.sourceHashes?.[name] !== null) throw new Error("INVALID_SOURCE_PRESENCE");
      return null;
    }
    const bytes = await readFile(join(folder, name));
    if (digest(bytes) !== manifest.sourceHashes?.[name]) throw new Error("SNAPSHOT_HASH_MISMATCH");
    return bytes;
  }));
  const sourceHashes = Object.fromEntries(sourceNames.map((name, index) => [name, buffers[index] === null ? null : digest(buffers[index])]));
  if (digest(JSON.stringify({ version: 1, hashes: sourceHashes })) !== identity) throw new Error("SNAPSHOT_IDENTITY_MISMATCH");
  const source = JSON.parse(buffers[0].toString("utf8"));
  const clients = JSON.parse(buffers[1].toString("utf8"));
  const compliance = JSON.parse(buffers[2].toString("utf8"));
  const documents = buffers[3] === null ? [] : JSON.parse(buffers[3].toString("utf8"));
  const audit = buffers[4].toString("utf8").split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  if (!compliance || !Array.isArray(compliance.rules) || !Array.isArray(compliance.evaluations)) throw new Error("INVALID_COMPLIANCE_SOURCE");
  const contract = validateThirdPartySource(source);
  const auxiliary = validateThirdPartyAuxiliarySources({ source, clients, compliance, documents, audit });
  const analysis = analyzeThirdPartyMigration(source, clients, audit, compliance, documents);
  const files = await analyzeThirdPartyFiles(source);
  const blockers = contract.blockers + auxiliary.blockers + analysis.blockers + files.blockers;
  if (blockers || !files.counts || analysis.counts.approvals || analysis.counts.schedules || analysis.counts.internalEvidenceReferences) throw new Error("SNAPSHOT_NOT_IMPORT_READY");
  return { identity, manifest, source, audit, files, rows: buildThirdPartySnapshotRows(source, audit) };
}

async function validateDestinationReferences(client, source, audit) {
  const tenantIds = new Set([
    ...(source.invitations ?? []).map(invite => invite.tenantId),
    ...audit.filter(event => event?.action?.startsWith("thirdparty.")).map(event => event.tenantId),
  ]);
  for (const tenantId of tenantIds) {
    if ((await client.query("SELECT 1 FROM sst.tenants WHERE id = $1", [tenantId])).rowCount !== 1) throw new Error("DESTINATION_TENANT_MISSING");
  }
  for (const invite of source.invitations ?? []) {
    const company = await client.query("SELECT 1 FROM sst.client_companies WHERE tenant_id = $1 AND id = $2", [invite.tenantId, invite.companyId]);
    const unit = await client.query("SELECT 1 FROM sst.client_units WHERE tenant_id = $1 AND id = $2 AND company_id = $3", [invite.tenantId, invite.unitId, invite.companyId]);
    if (company.rowCount !== 1 || unit.rowCount !== 1) throw new Error("DESTINATION_COMPANY_UNIT_MISSING");
  }
}

async function readExistingRows(client) {
  const actual = emptyRows();
  for (const spec of tableSpecs) {
    const result = await client.query(`SELECT ${spec.columns.join(", ")} FROM sst.${spec.table} ORDER BY tenant_id, source_order, id`);
    actual[spec.key] = result.rows.map(row => {
      const sourceOrder = Number(row.source_order);
      if (!Number.isSafeInteger(sourceOrder) || sourceOrder < 0) throw new Error("DESTINATION_ORDER_INVALID");
      return { ...row, source_order: sourceOrder };
    });
  }
  return actual;
}

async function insertRows(client, expected) {
  for (const spec of tableSpecs) {
    const columns = spec.columns;
    const placeholders = columns.map((column, index) => column === "payload" ? `$${index + 1}::jsonb` : `$${index + 1}`).join(", ");
    for (const row of expected[spec.key]) {
      await client.query(`INSERT INTO sst.${spec.table} (${columns.join(", ")}) VALUES (${placeholders})`, columns.map(column => column === "payload" ? JSON.stringify(row[column]) : row[column]));
    }
  }
}

export async function importThirdPartySnapshot(pool, snapshot) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock(22022, 8)");
    await validateDestinationReferences(client, snapshot.source, snapshot.audit);
    const actual = await readExistingRows(client);
    const isEmpty = tableSpecs.every(spec => actual[spec.key].length === 0);
    if (isEmpty) {
      await insertRows(client, snapshot.rows);
      const inserted = await readExistingRows(client);
      if (!reconcileThirdPartySnapshotRows(snapshot.rows, inserted)) throw new Error(`POST_IMPORT_RECONCILIATION_FAILED_${thirdPartySnapshotRowMismatches(snapshot.rows, inserted).join("_").toUpperCase()}`);
      await client.query("COMMIT");
      return "imported";
    }
    if (reconcileThirdPartySnapshotRows(snapshot.rows, actual)) {
      await client.query("ROLLBACK");
      return "already_reconciled";
    }
    throw new Error("DESTINATION_CONFLICT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && process.argv[1].endsWith("third-party-postgres-import.mjs")) {
  const snapshotArg = process.argv.find(value => value.startsWith("--snapshot="))?.slice("--snapshot=".length);
  if (process.argv.length !== 4 || !process.argv.includes("--apply") || !snapshotArg) {
    console.error("Importação exige --snapshot=<sha256> e --apply; nada foi gravado.");
    process.exitCode = 2;
  } else {
    let pool;
    try {
      const snapshot = await readSnapshot(snapshotArg);
      pool = new Pool(loadAdminPostgresConfig());
      const status = await importThirdPartySnapshot(pool, snapshot);
      console.log(JSON.stringify({ status, invitations: snapshot.rows.invitation.length, receipts: snapshot.rows.receipt.length,
        issues: snapshot.rows.issue.length, issueEvents: snapshot.rows.issue_event.length, approvals: snapshot.rows.approval.length,
        schedules: snapshot.rows.schedule.length, auditEvents: snapshot.rows.audit.length, verifiedPdfs: snapshot.files.counts.verified,
        sourceIdentity: snapshot.identity }));
    } catch (error) {
      console.error(`Importação/reconciliação não concluída (${typeof error?.message === "string" && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "IMPORT_ERROR"}). Transação revertida se aberta.`);
      process.exitCode = 1;
    } finally { await pool?.end(); }
  }
}
