import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifier = readFileSync(new URL("../scripts/verify-demo-trial-migration-isolated.mjs", import.meta.url), "utf8");

test("trial migration verifier is constrained to temporary loopback PostgreSQL", () => {
  assert.match(verifier, /docker\(\[\s*"run", "--rm", "-d"/);
  assert.match(verifier, /`sst-demo-trial-\$\{suffix\}`/);
  assert.match(verifier, /"127\.0\.0\.1::5432"/);
  assert.match(verifier, /if \(containerStarted\) \{\s*try \{ docker\(\["rm", "-f", containerName\]\)/);
  assert.doesNotMatch(verifier, /loadAdminPostgresConfig|loadRuntimePostgresConfig|\.env\.pg/);
});

test("trial migration verifier covers lifecycle, RLS, grants, and append-only audit", () => {
  assert.match(verifier, /0013_demo_trial_lifecycle\.sql/);
  assert.match(verifier, /app_can_select/);
  assert.match(verifier, /app_can_insert/);
  assert.match(verifier, /verify-approved-extension-cycle/);
  assert.match(verifier, /verify-denied-extension-cycle/);
  assert.match(verifier, /verify-concurrent-single-use-activation/);
  assert.match(verifier, /verify-concurrent-single-extension-request/);
  assert.match(verifier, /verify-master-and-tenant-read-rls/);
  assert.match(verifier, /demo_trial_test_reader/);
  assert.match(verifier, /demo_trial_test_writer/);
  assert.match(verifier, /sst-demo-master/);
  assert.match(verifier, /verify-master-only-invitation-write/);
  assert.match(verifier, /verify-tenant-scoped-trial-and-audit-writes/);
  assert.match(verifier, /crossTenantUpdate\.rowCount, 0/);
  assert.match(verifier, /activationOutcomes\.filter\(\(outcome\) => outcome\.accepted\)\.length, 1/);
  assert.match(verifier, /extensionOutcomes\.filter\(\(outcome\) => outcome\.accepted\)\.length, 1/);
  assert.match(verifier, /filter\(Boolean\), \["55000"\]/);
  assert.match(verifier, /verify-single-use-and-append-only-audit/);
  assert.match(verifier, /demo_trial_audit/);
  assert.match(verifier, /TRUNCATE sst\.demo_trial_audit/);
  assert.match(verifier, /preservedAudit\.rows\[0\]\.count, 1/);
});
