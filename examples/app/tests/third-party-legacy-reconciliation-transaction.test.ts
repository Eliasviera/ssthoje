import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import {
  assertThirdPartyReconciliationRole,
  executeThirdPartyReconciliationTransaction,
  ThirdPartyReconciliationAccessError,
} from "../src/lib/third-party-legacy-reconciliation-write-operations.ts";
import type { TenantWriteContext } from "../src/lib/tenant-write-operations.ts";

const context: TenantWriteContext = {
  userId: "user-synthetic",
  tenantId: "tenant-synthetic",
  role: "consultoria_admin",
};

function fakeClient() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("only roles allowed to review third-party documents pass the candidate gate", () => {
  assert.doesNotThrow(() => assertThirdPartyReconciliationRole("consultoria_admin"));
  assert.doesNotThrow(() => assertThirdPartyReconciliationRole("sst_tst"));
  for (const role of ["cliente", "terceiro", "medico_coordenador"] as const) {
    assert.throws(() => assertThirdPartyReconciliationRole(role), ThirdPartyReconciliationAccessError);
  }
});

test("sets the trusted web role inside the same transaction as the candidate operation", async () => {
  const { client, calls } = fakeClient();
  await executeThirdPartyReconciliationTransaction(client, context, {
    kind: "capture_invitation_context",
    args: ["invitation", "a".repeat(64), "a".repeat(64), "company", "unit", null, "escopo", ["PGR"]],
  });

  assert.deepEqual(calls.map(({ sql }) => sql), [
    "BEGIN",
    "SELECT set_config('sst.user_id', $1, true)",
    "SELECT set_config('sst.tenant_id', $1, true)",
    "SELECT set_config('sst.membership_role', $1, true)",
    "SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context($1,$2,$3,$4,$5,$6,$7,$8)",
    "COMMIT",
  ]);
  assert.deepEqual(calls[3].values, ["consultoria_admin"]);
  assert.deepEqual(calls[4].values, ["invitation", "a".repeat(64), "a".repeat(64), "company", "unit", null, "escopo", ["PGR"]]);
});

test("rolls back when the candidate SQL function call fails after setting its role", async () => {
  const { calls } = fakeClient();
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("record_receipt_reconciliation")) throw new Error("synthetic function failure");
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
  await assert.rejects(
    executeThirdPartyReconciliationTransaction(client, context, {
      kind: "record_receipt_reconciliation",
      args: ["receipt-id", "a".repeat(64), 0, "pending", null, "revisão humana"],
    }),
    /synthetic function failure/,
  );
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(calls.some(({ sql }) => sql === "COMMIT"), false);
});

test("receipt capture uses only the constant candidate statement and parameter values", async () => {
  const { client, calls } = fakeClient();
  const args = ["invitation", "a".repeat(64), 2, "receipt", "PGR", "pgr.pdf", "b".repeat(64), 2048, "2026-10-20T12:00:00.000Z", "2027-10-20", "previous", "00000000-0000-4000-8000-000000000001", "private-v1", "tenant/object.pdf"] as const;
  await executeThirdPartyReconciliationTransaction(client, context, { kind: "capture_legacy_receipt", args });
  assert.ok(calls.some(({ sql }) => sql === "SELECT * FROM third_party_legacy_reconciliation_candidate.capture_legacy_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::date,$11,$12::uuid,$13,$14)"));
  assert.deepEqual(calls.at(-2)?.values, [...args]);
});

test("rejects an unlisted runtime operation before beginning a transaction", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(
    executeThirdPartyReconciliationTransaction(client, context, {
      kind: "arbitrary_sql" as never,
      args: [],
    } as never),
    /não permitida/,
  );
  assert.deepEqual(calls, []);
});
