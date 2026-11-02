import { Pool } from "pg";
import { DEMO_MEMBERSHIPS, DEMO_TENANTS } from "../src/lib/tenant-access.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const tenantStatus = new Map(DEMO_TENANTS.map((tenant) => [tenant.id, tenant.status]));
const memberships = DEMO_MEMBERSHIPS;
const pool = new Pool({
  ...loadRuntimePostgresConfig(),
  max: 1,
  options: "-c default_transaction_read_only=on",
});

let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");

  let matched = 0;
  let mismatched = 0;
  const mismatchReasons = { missing: 0, membership: 0, tenant: 0 };
  const missingByTenant = Object.fromEntries(DEMO_TENANTS.map((tenant) => [tenant.id, 0]));
  for (const membership of memberships) {
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [membership.tenantId]);
    await client.query("SELECT set_config('sst.user_id', $1, true)", [membership.userId]);
    const result = await client.query(
      `SELECT m.role, m.status, t.status AS tenant_status
         FROM sst.tenant_memberships AS m
         JOIN sst.tenants AS t ON t.id = m.tenant_id
        WHERE m.tenant_id = $1 AND m.user_id = $2`,
      [membership.tenantId, membership.userId],
    );
    const row = result.rows[0];
    if (result.rows.length === 0) {
      mismatchReasons.missing++;
      missingByTenant[membership.tenantId]++;
      mismatched++;
    } else if (row.role !== membership.role || row.status !== membership.status) {
      mismatchReasons.membership++;
      mismatched++;
    } else if (row.tenant_status !== tenantStatus.get(membership.tenantId)) {
      mismatchReasons.tenant++;
      mismatched++;
    } else {
      matched++;
    }
  }

  const candidateReader = await client.query(
    "SELECT to_regprocedure('third_party_legacy_reconciliation_candidate.list_registered_private_file_objects()') IS NOT NULL AS installed",
  );
  const candidatePrerequisites = await client.query(`
    SELECT
      to_regnamespace('third_party_legacy_reconciliation_candidate') IS NOT NULL AS reconciliation_schema,
      to_regnamespace('third_party_evidence_candidate') IS NOT NULL AS evidence_schema,
      EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS schema
            ON schema.oid = relation.relnamespace
         WHERE schema.nspname = 'third_party_evidence_candidate'
           AND relation.relname = 'private_file_objects'
           AND relation.relkind IN ('r', 'p')
      ) AS private_objects_table,
      to_regclass('sst.tenants') IS NOT NULL AS tenants_table,
      to_regclass('sst.tenant_memberships') IS NOT NULL AS memberships_table,
      EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'third_party_legacy_reconciliation_candidate_executor') AS executor_role,
      EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sst_hoje_app') AS app_role
  `);

  await client.query("ROLLBACK");
  console.log(JSON.stringify({ status: mismatched === 0 ? "ok" : "mismatch", checked: memberships.length, matched, mismatched, mismatchReasons, missingByTenant, candidateReaderInstalled: candidateReader.rows[0].installed, candidatePrerequisites: candidatePrerequisites.rows[0] }));
  if (mismatched > 0) process.exitCode = 2;
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => undefined);
  const code = typeof error?.code === "string" ? error.code : "unavailable";
  console.error(JSON.stringify({ status: "unavailable", code }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
