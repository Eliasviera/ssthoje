import assert from "node:assert/strict";
import { test } from "node:test";
import { runControlledLostUpdateProbe } from "../scripts/m21-concurrency-probe.mjs";

test("ensaio isolado reproduz perda de atualização em snapshots JSON concorrentes", () => {
  assert.deepEqual(runControlledLostUpdateProbe(8), { writers: 8, persisted: 1, lost: 7 });
});

test("ensaio valida o limite de escritores", () => {
  assert.throws(() => runControlledLostUpdateProbe(1), /entre 2 e 64/);
  assert.throws(() => runControlledLostUpdateProbe(65), /entre 2 e 64/);
});
