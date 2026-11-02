import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { readPrivateRegistrySnapshotInTransaction } from "../src/lib/third-party-private-registry-operations.ts";
import { assertCurrentTenantMembershipParity, TenantTransactionAccessError, type TenantReadContext } from "../src/lib/tenant-membership-parity.ts";

const context: TenantReadContext = {
  userId: "user-synthetic",
  tenantId: "tenant-synthetic",
  membershipRole: "consultoria_admin",
};

function fakeClient() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("list_registered_private_file_objects")) return { rows: [] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

function membershipClient(row: {
  membership_role: string;
  membership_status: string;
  tenant_status: string;
} | null) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return { rows: row ? [row] : [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("membership parity accepts the active database role matching the session", async () => {
  const { client, calls } = membershipClient({
    membership_role: "consultoria_admin",
    membership_status: "active",
    tenant_status: "active",
  });

  await assertCurrentTenantMembershipParity(client, context);
  assert.deepEqual(calls[0].values, ["tenant-synthetic", "user-synthetic"]);
});

test("membership parity denies absent, suspended, inactive-tenant, and mismatched-role records", async () => {
  const mismatches = [
    null,
    { membership_role: "consultoria_admin", membership_status: "suspended", tenant_status: "active" },
    { membership_role: "consultoria_admin", membership_status: "active", tenant_status: "suspended" },
    { membership_role: "sst_tst", membership_status: "active", tenant_status: "active" },
  ];

  for (const membership of mismatches) {
    const { client } = membershipClient(membership);
    await assert.rejects(
      assertCurrentTenantMembershipParity(client, context),
      (error: unknown) => error instanceof TenantTransactionAccessError && error.statusCode === 403,
    );
  }
});

test("sets the trusted role, invokes the membership gate, then reads the fixed tenant registry", async () => {
  const { client, calls } = fakeClient();
  let checkedContext: TenantReadContext | undefined;
  const snapshot = await readPrivateRegistrySnapshotInTransaction(client, context, async (_client, checked) => {
    checkedContext = checked;
  });

  assert.equal(snapshot.tenantId, context.tenantId);
  assert.deepEqual(checkedContext, context);
  assert.deepEqual(calls.map(({ sql }) => sql), [
    "SELECT set_config('sst.membership_role', $1, true)",
    "SELECT tenant_id, object_id FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects() ORDER BY object_id",
  ]);
  assert.deepEqual(calls[0].values, ["consultoria_admin"]);
  assert.deepEqual(calls[1].values, []);
});

test("does not read the registry when the membership parity gate denies access", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(
    readPrivateRegistrySnapshotInTransaction(client, context, async () => {
      throw new Error("membership parity denied");
    }),
    /membership parity denied/,
  );
  assert.equal(calls.some(({ sql }) => sql.includes("list_registered_private_file_objects")), false);
});
