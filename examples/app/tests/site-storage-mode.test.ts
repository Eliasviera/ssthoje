import assert from "node:assert/strict";
import test from "node:test";
import { getSiteStorageMode } from "../src/lib/site-storage-mode.ts";

test("CMS usa PostgreSQL por padrão e aceita retorno explícito ao JSON", () => {
  assert.equal(getSiteStorageMode(undefined), "postgres");
  assert.equal(getSiteStorageMode("postgres"), "postgres");
  assert.equal(getSiteStorageMode("json"), "json");
  assert.equal(getSiteStorageMode("unexpected"), "postgres");
});
