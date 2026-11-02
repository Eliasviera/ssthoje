import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../db/migrations/0005_pgr_risk_inventory.sql", import.meta.url), "utf8");

test("migration PGR exige isolamento tenant e vínculos compostos", () => {
  assert.match(migration, /UNIQUE \(tenant_id, id, company_id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id, company_id\)[\s\S]*REFERENCES sst\.client_companies \(tenant_id, id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id, unit_id, company_id\)[\s\S]*REFERENCES sst\.client_units \(tenant_id, id, company_id\)/);
  for (const table of ["pgr_risk_inventories", "pgr_risk_items", "pgr_risk_inventory_revisions", "pgr_audit_history"]) {
    assert.match(migration, new RegExp(`ALTER TABLE sst\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE sst\\.${table} FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`CREATE POLICY [a-z_]+ ON sst\\.${table}\\s+USING \\(tenant_id = current_setting\\('sst\\.tenant_id', true\\)\\)\\s+WITH CHECK \\(tenant_id = current_setting\\('sst\\.tenant_id', true\\)\\)`));
  }
});

test("migration mantém revisões/auditoria append-only e não importa registros", () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON sst\.pgr_risk_inventory_revisions/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON sst\.pgr_audit_history/);
  assert.match(migration, /GRANT SELECT, INSERT ON sst\.pgr_risk_inventories/);
  assert.match(migration, /GRANT UPDATE \(title, activity_description, action_plan, status, reviewer_user_id, reviewer_role, revision, updated_at\)[\s\S]*ON sst\.pgr_risk_inventories/);
  assert.match(migration, /GRANT SELECT, INSERT ON sst\.pgr_risk_items/);
  assert.match(migration, /GRANT UPDATE \(process, activity, hazard, source_circumstance, possible_harm,[\s\S]*assessment, revision, active, updated_at\) ON sst\.pgr_risk_items/);
  assert.doesNotMatch(migration, /GRANT UPDATE[^;]*\bid\b[^;]*ON sst\.pgr_risk_(inventories|items)/);
  assert.match(migration, /GRANT SELECT, INSERT ON sst\.pgr_risk_inventory_revisions, sst\.pgr_audit_history/);
  assert.doesNotMatch(migration, /^\s*(INSERT|UPDATE|DELETE)\s/m);
});
