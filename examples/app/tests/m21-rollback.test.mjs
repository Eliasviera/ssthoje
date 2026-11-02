import assert from "node:assert/strict";
import { test } from "node:test";
import { runRollbackDrill } from "../scripts/m21-rollback-drill.mjs";

test("ensaio de rollback restaura snapshot isolado sem alterar o estado ativo simulado", () => {
  assert.deepEqual(runRollbackDrill(), {
    backupValid: true,
    restoredMatchesBackup: true,
    activeDataPreserved: true,
    restoredMarker: true,
  });
});
