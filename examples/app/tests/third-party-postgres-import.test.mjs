import test from "node:test";
import assert from "node:assert/strict";
import { buildThirdPartySnapshotRows, reconcileThirdPartySnapshotRows } from "../scripts/third-party-postgres-import.mjs";

test("projeção separa arrays em linhas ordenadas e preserva payload", () => {
  const invite = { id: "invite", tenantId: "tenant", companyId: "company", unitId: "unit", receipts: [{ id: "receipt", kind: "PGR", storageName: "opaque.pdf" }],
    issues: [{ id: "issue", originalReceiptId: "receipt", currentReceiptId: "receipt", events: [{ id: "event", receiptId: "receipt", type: "opened" }] }] };
  const audit = [{ id: "other", tenantId: "tenant", action: "client.updated" }, { id: "third", tenantId: "tenant", action: "thirdparty.read" }];
  const rows = buildThirdPartySnapshotRows({ invitations: [invite] }, audit);
  assert.equal(rows.invitation.length, 1); assert.equal(rows.invitation[0].payload.receipts, undefined); assert.equal(rows.invitation[0].payload.issues, undefined);
  assert.equal(rows.receipt[0].payload.storageName, "opaque.pdf"); assert.equal(rows.issue_event[0].receipt_id, "receipt");
  assert.deepEqual(rows.audit.map(row => row.id), ["third"]);
  assert.equal(invite.receipts.length, 1); assert.equal(invite.issues[0].events.length, 1);
});

test("reconciliação ignora ordem física das linhas, mas detecta qualquer divergência", () => {
  const expected = buildThirdPartySnapshotRows({ invitations: [
    { id: "a", tenantId: "tenant-a", companyId: "company", unitId: "unit", receipts: [], issues: [] },
    { id: "b", tenantId: "tenant-b", companyId: "company", unitId: "unit", receipts: [], issues: [] },
  ] }, []);
  const reordered = structuredClone(expected); reordered.invitation.reverse();
  assert.equal(reconcileThirdPartySnapshotRows(expected, reordered), true);
  reordered.invitation[0].payload.id = "changed";
  assert.equal(reconcileThirdPartySnapshotRows(expected, reordered), false);
});
