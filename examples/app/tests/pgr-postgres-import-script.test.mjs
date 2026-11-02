import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../scripts/pgr-postgres-import.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("CLI de importação exige aplicação explícita e usa apenas a credencial runtime", () => {
  assert.match(script, /process\.argv\.includes\("--apply"\)/);
  assert.match(script, /loadRuntimePostgresConfig/);
  assert.doesNotMatch(script, /loadAdminPostgresConfig/);
  assert.equal(packageJson.scripts["pgr:migration:import"], "node --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/pgr-postgres-import.mjs --apply");
});

test("CLI grava todos os tenants em uma transação e reverte se a origem mudar", () => {
  assert.match(script, /await client\.query\("BEGIN"\)/);
  assert.match(script, /pg_advisory_xact_lock/);
  assert.match(script, /set_config\('sst\.tenant_id', \$1, true\)/);
  assert.match(script, /importPgrLegacyBatchInTransaction/);
  assert.match(script, /digest\(bytes\) !== digest\(finalSourceBytes\[index\]\)/);
  assert.match(script, /await client\.query\("COMMIT"\)/);
  assert.match(script, /await client\.query\("ROLLBACK"\)/);
  assert.match(script, /cutover: false/);
});
