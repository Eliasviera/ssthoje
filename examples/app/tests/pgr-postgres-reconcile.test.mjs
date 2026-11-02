import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../scripts/pgr-postgres-reconcile.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("reconciliação PGR só abre transação PostgreSQL read-only", () => {
  assert.match(script, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(script, /ROLLBACK/);
  assert.doesNotMatch(script, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/im);
  assert.doesNotMatch(script, /client\.query\s*\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  assert.match(script, /--apply/);
  assert.equal(packageJson.scripts["pgr:migration:reconcile"], "node --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/pgr-postgres-reconcile.mjs");
});

test("reconciliação limita leitura por tenant e omite conteúdo da saída", () => {
  assert.match(script, /set_config\('sst\.tenant_id', \$1, true\)/);
  assert.match(script, /WHERE i\.tenant_id = \$1/);
  assert.match(script, /WHERE r\.tenant_id = \$1/);
  assert.match(script, /FROM sst\.pgr_audit_history WHERE tenant_id = \$1/);
  assert.match(script, /extraDestinationAuditEvents/);
  assert.match(script, /console\.log\(JSON\.stringify/);
  assert.doesNotMatch(script, /console\.log\([^\n]*(?:draft\.title|activityDescription|riskInventory|event\.actorUserId)/);
});

test("reconciliação valida revisão única, ausência de itens e dados de revisão do responsável", () => {
  assert.match(script, /reviewer_user_id/);
  assert.match(script, /reviewer_role/);
  assert.match(script, /source_draft_id === draft\.id/);
  assert.match(script, /revisionCount === 1/);
  assert.match(script, /riskItemCount === 0/);
  assert.match(script, /FROM sst\.pgr_risk_items ri WHERE ri\.tenant_id = \$1 GROUP BY ri\.inventory_id/);
  assert.match(script, /revisionCounts\.set\(key, \(revisionCounts\.get\(key\) \?\? 0\) \+ 1\)/);
  assert.match(script, /revision\.created_at, inventory\.legacySource\?\.snapshots\.at\(-1\)\?\.savedAt/);
});

test("plano read-only distingue schema ausente, lote importável, reconciliado e conflito", () => {
  for (const state of ["schema_missing", "ready_to_import", "already_reconciled", "destination_conflict", "source_blocked"]) {
    assert.match(script, new RegExp(state));
  }
  assert.match(script, /canImport: planState === "ready_to_import"/);
  assert.match(script, /destinationRevisions/);
  assert.match(script, /extraDestinationRevisions/);
  assert.match(script, /destinationRiskItems/);
  assert.match(script, /destinationEmpty = destinationInventories === 0 && destinationRevisions === 0/);
  assert.match(script, /fullyReconciled = matchedDrafts === localReport\.total/);
});
