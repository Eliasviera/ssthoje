import assert from "node:assert/strict";
import test from "node:test";
import { getClientStorageMode } from "../src/lib/client-storage-mode.ts";

test("client storage remains JSON until all consumers are ready for PostgreSQL", () => {
  assert.equal(getClientStorageMode(undefined), "json");
  assert.equal(getClientStorageMode("json"), "json");
  assert.equal(getClientStorageMode("postgres"), "json");
  assert.equal(getClientStorageMode("unexpected"), "json");
});
