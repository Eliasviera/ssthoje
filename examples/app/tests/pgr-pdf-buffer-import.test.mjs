import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/api/pgr/import-pdf/route.ts", import.meta.url), "utf8");
const extractor = readFileSync(new URL("../src/lib/pgr-pdf-extractor.ts", import.meta.url), "utf8");
const importTypes = readFileSync(new URL("../src/lib/pgr-pdf-import.ts", import.meta.url), "utf8");

test("PGR PDF route extracts from request bytes without persisting an upload", () => {
  assert.match(route, /extractPgrFromPdfBuffer\(bytes\)/);
  assert.doesNotMatch(route, /savePgrPdfUpload|filePath/);
  assert.match(extractor, /extractPgrFromPdfBuffer\(input: Uint8Array\)/);
  assert.match(extractor, /Buffer\.from\(input\)/);
  assert.doesNotMatch(extractor, /readFileSync/);
  assert.doesNotMatch(importTypes, /writeFileSync|mkdirSync|uploads/);
});
