import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "sst-hoje-m21-health-"));
const healthyRoot = join(root, "healthy");
const degradedRoot = join(root, "degraded");
mkdirSync(healthyRoot);
mkdirSync(degradedRoot);
const originalCwd = process.cwd();
after(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

test("health retorna apenas status quando a pasta local de dados existe", async () => {
  mkdirSync(join(healthyRoot, "data"));
  process.chdir(healthyRoot);
  const { GET } = await import("../src/app/api/health/route.ts");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("health sinaliza indisponibilidade sem expor detalhes", async () => {
  process.chdir(degradedRoot);
  const { GET } = await import("../src/app/api/health/route.ts");
  const response = await GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "degraded" });
});
