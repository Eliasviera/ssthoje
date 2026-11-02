import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../db/migrations/0006_pgr_exposure_evaluations.sql", import.meta.url), "utf8");

test("migration vincula avaliações ao risco e ao tenant por FK composta", () => {
  assert.match(migration, /PRIMARY KEY \(tenant_id, inventory_id, risk_item_id, id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id, inventory_id, risk_item_id\)[\s\S]*REFERENCES sst\.pgr_risk_items \(tenant_id, inventory_id, id\)/);
  assert.match(migration, /CHECK \(evaluation_type IN \('qualitative', 'quantitative'\)\)/);
  assert.match(migration, /CHECK \(status IN \('planned', 'collected', 'reviewed'\)\)/);
});

test("migration ativa RLS forçada e limita campos de atualização, sem importar dados", () => {
  assert.match(migration, /ALTER TABLE sst\.pgr_exposure_evaluations ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE sst\.pgr_exposure_evaluations FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(tenant_id = current_setting\('sst\.tenant_id', true\)\)[\s\S]*WITH CHECK \(tenant_id = current_setting\('sst\.tenant_id', true\)\)/);
  assert.match(migration, /GRANT UPDATE \(agent, evaluation_type, status,[\s\S]*ON sst\.pgr_exposure_evaluations/);
  assert.doesNotMatch(migration, /^\s*(INSERT|UPDATE|DELETE)\s/m);
});
