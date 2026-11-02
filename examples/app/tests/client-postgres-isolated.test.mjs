import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifier = readFileSync(new URL("../scripts/verify-client-postgres-isolated.mjs", import.meta.url), "utf8");

test("verificação de clientes usa somente PostgreSQL temporário e porta de loopback", () => {
  assert.match(verifier, /docker\(\[\s*"run", "--rm", "-d"/);
  assert.match(verifier, /`sst-clients-rls-\$\{suffix\}`/);
  assert.match(verifier, /"127\.0\.0\.1::5432"/);
  assert.match(verifier, /if \(containerStarted\) \{\s*try \{ docker\(\["rm", "-f", containerName\]\)/);
  assert.doesNotMatch(verifier, /loadAdminPostgresConfig|loadRuntimePostgresConfig|app-db-1/);
});

test("verificação testa RLS de leitura/escrita, transação de domínio e auditoria", () => {
  assert.match(verifier, /applyMigration\("0001_tenant_registry\.sql"\)/);
  assert.match(verifier, /applyMigration\("0004_client_companies\.sql"\)/);
  assert.match(verifier, /SET LOCAL ROLE sst_hoje_app/);
  assert.match(verifier, /listClientCompaniesInTransaction/);
  assert.match(verifier, /noTenantContext\.rowCount, 0/);
  assert.match(verifier, /createClientCompanyInTransaction/);
  assert.match(verifier, /setClientCompanyStatusInTransaction/);
  assert.match(verifier, /verify-cross-tenant-write-is-denied/);
  assert.match(verifier, /code: "42501"/);
  assert.match(verifier, /client_audit_history/);
});
