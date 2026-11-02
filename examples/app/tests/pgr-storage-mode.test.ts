import assert from "node:assert/strict";
import test from "node:test";
import { getPgrStorageMode } from "../src/lib/pgr-storage-mode.ts";

test("PGR usa PostgreSQL por padrão e permite retorno explícito ao JSON", () => {
  assert.equal(getPgrStorageMode(undefined), "postgres");
  assert.equal(getPgrStorageMode("postgres"), "postgres");
  assert.equal(getPgrStorageMode("json"), "json");
});
