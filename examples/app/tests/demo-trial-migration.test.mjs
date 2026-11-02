import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../db/migrations/0013_demo_trial_lifecycle.sql", import.meta.url), "utf8");

test("demo trial migration stores only a one-way token hash and activation state", () => {
  assert.match(migration, /token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(migration, /status IN \('pending', 'activated', 'revoked'\)/);
  assert.match(migration, /activated_tenant_id text REFERENCES sst\.tenants\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /CREATE TRIGGER demo_invitation_single_use[\s\S]*BEFORE UPDATE OR DELETE ON sst\.demo_invitations/);
  assert.match(migration, /OLD\.status <> 'pending'[\s\S]*NEW\.status NOT IN \('activated', 'revoked'\)/);
  assert.match(migration, /FOREIGN KEY \(invitation_id, tenant_id\)[\s\S]*REFERENCES sst\.demo_invitations\(id, activated_tenant_id\) ON DELETE RESTRICT/);
  assert.match(migration, /'invitation_activated'/);
});

test("demo trial duration and single extension are constrained to 30 additional days", () => {
  assert.match(migration, /expires_at = activated_at \+ interval '30 days'/);
  assert.match(migration, /expires_at = activated_at \+ interval '60 days'/);
  assert.match(migration, /extension_status IN \('none', 'pending', 'approved', 'denied'\)/);
  assert.match(migration, /extension_status = 'approved'[\s\S]*extended_at IS NOT NULL[\s\S]*interval '60 days'/);
  assert.match(migration, /extension_status = 'denied'[\s\S]*extended_at IS NULL[\s\S]*interval '30 days'/);
  assert.match(migration, /CREATE TRIGGER demo_trial_extension_once[\s\S]*BEFORE UPDATE OR DELETE ON sst\.demo_trials/);
  assert.match(migration, /OLD\.extension_status = 'pending'[\s\S]*NEW\.extension_status IN \('approved', 'denied'\)/);
});

test("demo lifecycle tables require server authorization and have tenant RLS", () => {
  for (const table of ["demo_invitations", "demo_trials", "demo_trial_audit"]) {
    assert.match(migration, new RegExp(`ALTER TABLE sst\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE sst\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /demo_invitations_master_only[\s\S]*current_setting\('sst\.user_id', true\) = 'sst-demo-master'/);
  assert.match(migration, /demo_trials_current_tenant[\s\S]*tenant_id = current_setting\('sst\.tenant_id', true\)/);
  assert.match(migration, /demo_trial_audit_master_read[\s\S]*FOR SELECT USING \(current_setting\('sst\.user_id', true\) = 'sst-demo-master'\)/);
  assert.equal((migration.match(/CREATE POLICY demo_trial_audit_master_read/g) ?? []).length, 1);
  assert.match(migration, /REVOKE ALL ON sst\.demo_invitations, sst\.demo_trials, sst\.demo_trial_audit FROM PUBLIC, sst_hoje_app/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON sst\.demo_trial_audit/);
  assert.match(migration, /BEFORE TRUNCATE ON sst\.demo_trial_audit[\s\S]*FOR EACH STATEMENT/);
});

test("candidate migration neither mutates existing data nor implements data purge", () => {
  assert.doesNotMatch(migration, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\s/m);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /CASCADE/i);
  assert.doesNotMatch(migration, /GRANT\s/i);
});
