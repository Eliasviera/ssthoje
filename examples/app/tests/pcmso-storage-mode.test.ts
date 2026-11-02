import assert from "node:assert/strict";
import test from "node:test";
import { getPcmsoStorageMode } from "../src/lib/pcmso-storage-mode.ts";

test("PCMSO mantém JSON como padrão até a reconciliação e corte autorizados", () => {
  assert.equal(getPcmsoStorageMode(undefined), "json");
  assert.equal(getPcmsoStorageMode("json"), "json");
  assert.equal(getPcmsoStorageMode("postgres"), "postgres");
  assert.equal(getPcmsoStorageMode("unexpected"), "json");
});
