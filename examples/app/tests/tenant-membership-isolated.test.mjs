import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifier = readFileSync(new URL("../scripts/verify-tenant-membership-isolated.mjs", import.meta.url), "utf8");

test("membership verifier uses only a temporary PostgreSQL container on loopback", () => {
  assert.match(verifier, /docker\(\[\s*"run", "--rm", "-d"/);
  assert.match(verifier, /`sst-membership-rls-\$\{suffix\}`/);
  assert.match(verifier, /"127\.0\.0\.1::5432"/);
  assert.match(verifier, /if \(containerStarted\) \{\s*try \{ docker\(\["rm", "-f", containerName\]\)/);
  assert.doesNotMatch(verifier, /loadAdminPostgresConfig|loadRuntimePostgresConfig|\.env\.pg/);
});

test("membership verifier executes the real parity gate under RLS with synthetic states", () => {
  assert.match(verifier, /assertCurrentTenantMembershipParity/);
  assert.match(verifier, /0001_tenant_registry\.sql/);
  assert.match(verifier, /SET LOCAL ROLE sst_hoje_app/);
  assert.match(verifier, /verify-active-membership/);
  assert.match(verifier, /membership inexistente/);
  assert.match(verifier, /membership suspensa/);
  assert.match(verifier, /tenant suspenso/);
  assert.match(verifier, /papel divergente/);
  assert.match(verifier, /ausência de tenant/);
  assert.match(verifier, /ausência de usuário/);
});
