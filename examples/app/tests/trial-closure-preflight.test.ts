import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectTrialClosure, TrialClosurePreflightError } from "../src/lib/trial-closure-preflight.ts";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const user = `trial-user-${firstId}`, tenant = `trial-tenant-${firstId}`;
const otherTenant = `trial-tenant-${secondId}`;
const now = new Date("2026-11-02T12:00:00Z");
const script = resolve("scripts/trial-closure-dry-run.mjs");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sst-trial-closure-"));
  const data = join(root, "data"); mkdirSync(data);
  const records = [firstId, secondId].map((id) => ({
    id: `invite-${id}`, label: "PRIVATE_LABEL", tokenHash: "PRIVATE_TOKEN_HASH", usedByEmail: "private@example.invalid",
    usedAt: "2026-09-01T12:00:00.000Z",
    account: { userId: `trial-user-${id}`, tenantId: `trial-tenant-${id}`, inviteId: `invite-${id}`, displayName: "PRIVATE_NAME", email: "private@example.invalid", passwordHash: "PRIVATE_PASSWORD_HASH", activatedAt: "2026-09-01T12:00:00.000Z", expiresAt: "2026-10-01T12:00:00.000Z", extensionsUsed: 0 },
  }));
  const save = (name: string, value: unknown) => writeFileSync(join(data, name), JSON.stringify(value));
  save("invites.json", records);
  return { root, data, records, save };
}
function digest(directory: string): string {
  const hash = createHash("sha256");
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(entry.name);
      if (entry.isDirectory()) visit(join(path, entry.name)); else hash.update(readFileSync(join(path, entry.name)));
    }
  }
  visit(directory); return hash.digest("hex");
}
test("diagnóstico vencido conta somente o tenant da conta e não altera byte algum", () => {
  const f = fixture();
  f.save("clients.json", [{ tenantId: tenant, name: "PRIVATE_COMPANY" }, { tenantId: otherTenant, name: "OTHER_COMPANY" }, { tenantId: "tenant-horizonte" }]);
  f.save("checklists.json", { templates: [{ tenantId: tenant }], inspections: [{ tenantId: otherTenant }, { tenantId: tenant }] });
  mkdirSync(join(f.data, "document-files", tenant), { recursive: true });
  mkdirSync(join(f.data, "document-files", otherTenant));
  writeFileSync(join(f.data, "document-files", tenant, "PRIVATE_FILE_NAME.pdf"), "synthetic");
  writeFileSync(join(f.data, "document-files", otherTenant, "other.pdf"), "other-tenant-synthetic");
  const before = digest(f.root);
  const result = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.equal(result.eligibleByTime, true);
  assert.equal(result.deletionAllowed, false);
  assert.equal(result.entries.find((entry) => entry.store === "clients.json")!.matchingRows, 1);
  assert.equal(result.entries.find((entry) => entry.store === "checklists.json")!.matchingRows, 2);
  assert.deepEqual(result.entries.find((entry) => entry.store === "document-files"), { store: "document-files", status: "scanned", files: 1, bytes: 9 });
  assert.ok(result.blockers.includes("shared_writers_not_locked"));
  assert.ok(result.blockers.includes("postgres_not_verified"));
  for (const privateValue of ["PRIVATE_", "OTHER_COMPANY", "private@example.invalid", user, tenant, otherTenant]) assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.equal(digest(f.root), before);
});
test("prazo considera extensão e limite exato sem confundir elegibilidade temporal com exclusão", () => {
  const f = fixture();
  f.records[0].account.expiresAt = now.toISOString(); f.save("invites.json", f.records);
  assert.equal(inspectTrialClosure(user, { dataDirectory: f.data, now }).eligibleByTime, true);
  f.records[0].account.expiresAt = "2026-11-03T12:00:00.000Z"; f.records[0].account.extensionsUsed = 1;
  f.save("invites.json", f.records);
  const result = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.equal(result.eligibleByTime, false);
  assert.ok(result.blockers.includes("trial_not_expired"));
  assert.equal(result.trial.extensionsUsed, 1);
  assert.equal(result.deletionAllowed, false);
});
test("identidade inválida, escopo adulterado, duplicidade e datas inválidas negam o diagnóstico", () => {
  const f = fixture();
  for (const id of ["sst-demo-user", "trial-user-../../fora", "trial-user-nao-uuid"]) assert.throws(() => inspectTrialClosure(id, { dataDirectory: f.data, now }), TrialClosurePreflightError);
  f.records[0].account.tenantId = otherTenant; f.save("invites.json", f.records);
  assert.throws(() => inspectTrialClosure(user, { dataDirectory: f.data, now }), /invalid_account/);
  f.records[0].account.tenantId = tenant; f.records[1].account.tenantId = tenant; f.save("invites.json", f.records);
  assert.throws(() => inspectTrialClosure(user, { dataDirectory: f.data, now }), /invalid_account/);
  f.records[1].account.tenantId = otherTenant; f.records[0].account.expiresAt = "invalid PRIVATE_DATE"; f.save("invites.json", f.records);
  assert.throws(() => inspectTrialClosure(user, { dataDirectory: f.data, now }), /invalid_account/);
});
test("fontes desconhecidas, campos não mapeados, JSON inválido e trava bloqueiam sem vazar conteúdo", () => {
  const f = fixture();
  f.save("checklists.json", { templates: [], inspections: [], newPrivateCollection: [{ tenantId: tenant }] });
  f.save("clients.json", [{ tenantId: tenant }, { tenantId: null }]);
  writeFileSync(join(f.data, "workers.json"), "INVALID_JSON_PRIVATE_VALUE");
  writeFileSync(join(f.data, "PRIVATE_UNKNOWN_FILE.txt"), "PRIVATE_BODY");
  writeFileSync(join(f.data, "invites.lock"), "");
  const before = digest(f.root);
  const result = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.equal(result.unmappedTopLevelEntries, 2);
  assert.ok(result.blockers.includes("pending_write_or_lock"));
  assert.ok(result.blockers.includes("unmapped_top_level_entries"));
  for (const name of ["checklists.json", "clients.json", "workers.json"]) assert.equal(result.entries.find((entry) => entry.store === name)!.status, "blocked");
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(digest(f.root), before);
});
test("conteúdo médico não é parseado nem projetado; alteração da fonte muda fingerprint", () => {
  const f = fixture();
  writeFileSync(join(f.data, "aso.json"), "NOT_JSON_PRIVATE_MEDICAL");
  const first = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.deepEqual(first.entries.find((entry) => entry.store === "aso.json"), { store: "aso.json", status: "metadata_only" });
  assert.ok(first.blockers.includes("restricted_or_shared_sources_not_scoped"));
  f.save("clients.json", [{ tenantId: tenant }]);
  const second = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.notEqual(second.sourceFingerprint, first.sourceFingerprint);
  assert.equal(JSON.stringify(second).includes("PRIVATE_MEDICAL"), false);
});
test("links simbólicos não são percorridos", (context) => {
  const f = fixture();
  const outside = mkdtempSync(join(tmpdir(), "sst-trial-closure-outside-"));
  writeFileSync(join(outside, "private.txt"), "outside-private");
  mkdirSync(join(f.data, "document-files"));
  try { symlinkSync(outside, join(f.data, "document-files", tenant), "junction"); }
  catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { context.skip("Windows não concedeu permissão de criar junction."); return; }
    throw error;
  }
  const result = inspectTrialClosure(user, { dataDirectory: f.data, now });
  assert.equal(result.entries.find((entry) => entry.store === "document-files")!.status, "blocked");
  assert.equal(readFileSync(join(outside, "private.txt"), "utf8"), "outside-private");
});
test("CLI rejeita --apply e não expõe mensagens brutas ao encontrar registro inválido", () => {
  const f = fixture();
  const before = digest(f.root);
  const refused = spawnSync(process.execPath, ["--experimental-strip-types", script, "--apply", `--user-id=${user}`], { cwd: f.root, encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--apply não existe/);
  assert.equal(digest(f.root), before);
  const preview = spawnSync(process.execPath, ["--experimental-strip-types", script, "--dry-run", `--user-id=${user}`], { cwd: f.root, encoding: "utf8" });
  assert.equal(preview.status, 2, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).deletionAllowed, false);
  assert.equal(digest(f.root), before);
  writeFileSync(join(f.data, "invites.json"), "INVALID_PRIVATE_REGISTRY");
  const invalid = spawnSync(process.execPath, ["--experimental-strip-types", script, "--dry-run", `--user-id=${user}`], { cwd: f.root, encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error, "registry_unavailable");
  assert.equal(invalid.stderr.includes("PRIVATE"), false);
});
