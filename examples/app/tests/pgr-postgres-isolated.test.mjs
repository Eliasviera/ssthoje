import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifier = readFileSync(new URL("../scripts/verify-pgr-postgres-isolated.mjs", import.meta.url), "utf8");

test("prova PostgreSQL PGR usa somente container temporário e limpa ao terminar", () => {
  assert.match(verifier, /docker\(\[\s*"run", "--rm", "-d"/);
  assert.match(verifier, /`sst-pgr-rls-\$\{suffix\}`/);
  assert.match(verifier, /"127\.0\.0\.1::5432"/);
  assert.match(verifier, /if \(containerStarted\) \{\s*try \{ docker\(\["rm", "-f", containerName\]\)/);
  assert.doesNotMatch(verifier, /loadAdminPostgresConfig|loadRuntimePostgresConfig|app-db-1/);
});

test("prova roda migration/import sob o papel runtime e verifica RLS", () => {
  assert.match(verifier, /apply-temporary-migration/);
  assert.match(verifier, /SET LOCAL ROLE sst_hoje_app/);
  assert.match(verifier, /importPgrLegacyBatchInTransaction/);
  assert.match(verifier, /verify-idempotent-retry-under-runtime-role/);
  assert.match(verifier, /\"already_imported\"/);
  assert.match(verifier, /noTenantContext\.rowCount, 0/);
  assert.match(verifier, /assert\.rejects\([\s\S]*code: "42501"/);
});
