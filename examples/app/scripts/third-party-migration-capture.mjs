import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectThirdPartySource } from "./third-party-migration-dry-run.mjs";

const names = ["third-party.json", "clients.json", "compliance.json", "documents.json", "audit-log.jsonl"];
const digest = value => createHash("sha256").update(value).digest("hex");
const root = join(process.cwd(), "data", "third-party-migration-snapshots");
async function readSource(name) {
  try { return await readFile(join(process.cwd(), "data", name)); }
  catch (error) { if (name === "documents.json" && error.code === "ENOENT") return null; throw error; }
}

export async function captureThirdPartySource(read = readSource, verify = inspectThirdPartySource, destinationRoot = root) {
  const report = await verify(read);
  if (!report.sourceStable || report.blockers) throw new Error("SOURCE_NOT_CAPTURE_READY");
  const buffers = await Promise.all(names.map(name => read(name)));
  const hashes = Object.fromEntries(names.map((name, index) => [name, buffers[index] === null ? null : digest(buffers[index])]));
  if (names.some(name => hashes[name] !== report.sourceHashes[name])) throw new Error("SOURCE_CHANGED_BEFORE_CAPTURE");
  const identity = digest(JSON.stringify({ version: 1, hashes }));
  const target = join(destinationRoot, identity);
  await mkdir(destinationRoot, { recursive: true });
  await mkdir(target, { recursive: false });
  for (let index = 0; index < names.length; index++) {
    if (buffers[index] !== null) await writeFile(join(target, names[index]), buffers[index], { flag: "wx" });
  }
  const after = await Promise.all(names.map(name => read(name)));
  const stable = names.every((name, index) => (after[index] === null ? null : digest(after[index])) === hashes[name]);
  const manifest = {
    version: 1,
    identity,
    sourceHashes: hashes,
    sourcePresence: Object.fromEntries(names.map((name, index) => [name, buffers[index] !== null])),
    contractVersion: report.contractVersion,
    auxiliaryContractVersion: report.auxiliaryContractVersion,
    sourceStableDuringCapture: stable,
    totals: report.sourceManifest.totals,
    verifiedPdfCount: report.files.counts.verified,
    verifiedPdfBytes: report.files.counts.verifiedBytes,
  };
  await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  if (!stable) throw new Error("SOURCE_CHANGED_DURING_CAPTURE");
  return { identity, sourceStableDuringCapture: stable, totals: manifest.totals, verifiedPdfCount: manifest.verifiedPdfCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length !== 3 || process.argv[2] !== "--capture") {
    console.error("Captura local somente com --capture; nenhum dado foi alterado.");
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await captureThirdPartySource())); }
    catch (error) {
      console.error(`Captura não concluída (${typeof error?.message === "string" && /^[A-Z_]+$/.test(error.message) ? error.message : "CAPTURE_ERROR"}). Snapshot incompleto, se criado, não pode ser importado.`);
      process.exitCode = 1;
    }
  }
}
