import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { listThirdPartySnapshotsInTransaction } from "../src/lib/third-party-postgres-read-operations.ts";

const stamp = "2026-10-15T12:00:00.000Z";
function fixture() {
  return {
    invitation: [{ tenant_id: "tenant", id: "invite", payload: { id: "invite", tenantId: "tenant", companyId: "company", unitId: "unit", companyName: "Empresa fictícia", unitName: "Unidade fictícia", relatedCnpj: "11111111000111", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", tokenHash: "a".repeat(64), requested: ["PGR"], createdAt: stamp, expiresAt: "2026-10-16T12:00:00.000Z" } }],
    receipt: [{ tenant_id: "tenant", id: "receipt", invitation_id: "invite", payload: { id: "receipt", kind: "PGR", fileName: "ficticio.pdf", storageName: "private-file.pdf", size: 10, digest: "b".repeat(64), receivedAt: stamp } }],
    issue: [], issue_event: [], approval: [], schedule: [],
  };
}
function clientFor(rows: Record<string, unknown[]>) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = { async query(sql: string, values: unknown[]) {
    calls.push({ sql, values });
    const name = /sst\.third_party_(\w+)_snapshots/.exec(sql)?.[1];
    return { rows: rows[name ?? ""] ?? [] };
  } } as unknown as PoolClient;
  return { client, calls };
}
test("leitura candidata preserva projeção e não retorna segredos de armazenamento", async () => {
  const rows = fixture(), before = JSON.stringify(rows), { client, calls } = clientFor(rows);
  const result = await listThirdPartySnapshotsInTransaction(client, "tenant", new Date(stamp));
  assert.equal(result.length, 1); assert.equal(result[0].linkStatus, "active"); assert.equal(result[0].receipts[0].id, "receipt");
  assert.equal(JSON.stringify(result).includes("private-file.pdf"), false); assert.equal(JSON.stringify(result).includes("tokenHash"), false);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(calls.length, 6);
  for (const call of calls) { assert.match(call.sql, /^SELECT .*WHERE tenant_id = \$1 ORDER BY source_order, id$/); assert.deepEqual(call.values, ["tenant"]); }
});
test("tenant inválido é recusado antes de consultar", async () => {
  const { client, calls } = clientFor(fixture());
  await assert.rejects(listThirdPartySnapshotsInTransaction(client, "../other")); assert.equal(calls.length, 0);
});
test("resposta de outra consultoria e identidade divergente interrompem leitura", async () => {
  const foreign = fixture(); foreign.receipt[0].tenant_id = "other";
  await assert.rejects(listThirdPartySnapshotsInTransaction(clientFor(foreign).client, "tenant"));
  const wrong = fixture(); wrong.receipt[0].payload.id = "different";
  await assert.rejects(listThirdPartySnapshotsInTransaction(clientFor(wrong).client, "tenant"));
});
test("filhos órfãos, duplicidade e campos desconhecidos são recusados", async () => {
  const orphan = fixture(); orphan.receipt[0].invitation_id = "missing";
  await assert.rejects(listThirdPartySnapshotsInTransaction(clientFor(orphan).client, "tenant"));
  const duplicate = fixture(); duplicate.receipt.push(structuredClone(duplicate.receipt[0]));
  await assert.rejects(listThirdPartySnapshotsInTransaction(clientFor(duplicate).client, "tenant"));
  const unknown = fixture(); Object.assign(unknown.invitation[0].payload, { unknownField: "private" });
  await assert.rejects(listThirdPartySnapshotsInTransaction(clientFor(unknown).client, "tenant"));
});
test("expiração e revogação não apagam os recibos", async () => {
  const rows = fixture();
  const expired = await listThirdPartySnapshotsInTransaction(clientFor(rows).client, "tenant", new Date("2026-10-17T12:00:00Z"));
  assert.equal(expired[0].linkStatus, "expired"); assert.equal(expired[0].receipts.length, 1);
  Object.assign(rows.invitation[0].payload, { revokedAt: stamp });
  const revoked = await listThirdPartySnapshotsInTransaction(clientFor(rows).client, "tenant", new Date(stamp));
  assert.equal(revoked[0].linkStatus, "revoked"); assert.equal(revoked[0].receipts.length, 1);
});
