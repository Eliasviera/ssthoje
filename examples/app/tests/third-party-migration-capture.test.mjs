import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { captureThirdPartySource } from "../scripts/third-party-migration-capture.mjs";

const names = ["third-party.json", "clients.json", "compliance.json", "documents.json", "audit-log.jsonl"];
const digest = value => value === null ? null : createHash("sha256").update(value).digest("hex");
function sources() { return new Map(names.map((name, index) => [name, name === "documents.json" ? null : Buffer.from(`fictitious-${index}`)])); }
function verifier() {
  return async read => {
    const contents = await Promise.all(names.map(name => read(name)));
    return { sourceStable: true, blockers: 0, sourceHashes: Object.fromEntries(names.map((name, index) => [name, digest(contents[index])])),
      contractVersion: 1, auxiliaryContractVersion: 1, sourceManifest: { totals: { tenants: 1, invitations: 1, sourceAuditRows: 0, internalDocuments: 0 } },
      files: { counts: { verified: 1, verifiedBytes: 10 } } };
  };
}
function reader(map) { return async name => map.get(name); }

test("captura preserva hashes e ausência de fonte opcional sem expor conteúdo", async () => {
  const folder = await mkdtemp(join(tmpdir(), "sst-third-party-capture-"));
  try {
    const map = sources(), result = await captureThirdPartySource(reader(map), verifier(), join(folder, "snapshots"));
    assert.equal(result.sourceStableDuringCapture, true);
    const manifest = JSON.parse(await readFile(join(folder, "snapshots", result.identity, "manifest.json"), "utf8"));
    assert.equal(manifest.sourcePresence["documents.json"], false);
    assert.equal(manifest.sourceHashes["documents.json"], null);
    assert.equal(JSON.stringify(manifest).includes("fictitious"), false);
    await assert.rejects(readFile(join(folder, "snapshots", result.identity, "documents.json")), { code: "ENOENT" });
  } finally {
    const root = resolve(tmpdir()), target = resolve(folder);
    assert.ok(target.startsWith(`${root}${sep}`));
    await rm(target, { recursive: true, force: true });
  }
});

test("captura marca e recusa fonte que mudou durante a cópia", async () => {
  const folder = await mkdtemp(join(tmpdir(), "sst-third-party-capture-change-"));
  try {
    const map = sources(); let calls = 0;
    const read = async name => { calls++; if (calls > 10 && name === "clients.json") return Buffer.from("changed"); return map.get(name); };
    await assert.rejects(captureThirdPartySource(read, verifier(), join(folder, "snapshots")), /SOURCE_CHANGED_DURING_CAPTURE/);
    const dirs = await (await import("node:fs/promises")).readdir(join(folder, "snapshots"));
    const manifest = JSON.parse(await readFile(join(folder, "snapshots", dirs[0], "manifest.json"), "utf8"));
    assert.equal(manifest.sourceStableDuringCapture, false);
  } finally {
    const root = resolve(tmpdir()), target = resolve(folder);
    assert.ok(target.startsWith(`${root}${sep}`));
    await rm(target, { recursive: true, force: true });
  }
});
