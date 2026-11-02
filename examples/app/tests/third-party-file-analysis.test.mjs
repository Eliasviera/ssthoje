import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { analyzeThirdPartyFiles } from "../src/lib/third-party-file-analysis.mjs";

const bytes = Buffer.from("%PDF-1.4\nFICTITIOUS TEST BYTES ONLY\n");
const digest = value => createHash("sha256").update(value).digest("hex");
const has = (report, code) => report.issues.some(issue => issue.code === code);
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "sst-thirdparty-files-"));
  try {
    const folder = join(root, "data/third-party-files/tenant");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "receipt.pdf"), bytes);
    const receipt = { storageName: "receipt.pdf", size: bytes.length, digest: digest(bytes) };
    const source = { invitations: [{ tenantId: "tenant", receipts: [receipt] }] };
    await run({ root, folder, source, receipt });
  } finally {
    const absolute = resolve(root);
    assert.equal(dirname(absolute), resolve(tmpdir()));
    assert.ok(basename(absolute).startsWith("sst-thirdparty-files-"));
    await rm(absolute, { recursive: true, force: true });
  }
}
test("confere bytes sem modificar origem nem arquivo e sem expor caminhos", async () => fixture(async ({ root, folder, source }) => {
  const before = JSON.stringify(source), report = await analyzeThirdPartyFiles(source, root);
  assert.equal(report.blockers, 0); assert.equal(report.counts.verified, 1); assert.equal(report.counts.verifiedBytes, bytes.length);
  assert.equal(JSON.stringify(source), before); assert.deepEqual(await readFile(join(folder, "receipt.pdf")), bytes);
  for (const value of [root, "receipt.pdf", digest(bytes)]) assert.equal(JSON.stringify(report).includes(value), false);
}));
test("recusa arquivo ausente, tamanho divergente e hash divergente", async () => fixture(async ({ root, source, receipt }) => {
  receipt.storageName = "missing.pdf"; assert.ok(has(await analyzeThirdPartyFiles(source, root), "PDF_FILE_MISSING"));
  receipt.storageName = "receipt.pdf"; receipt.size++; assert.ok(has(await analyzeThirdPartyFiles(source, root), "PDF_SIZE_MISMATCH"));
  receipt.size--; receipt.digest = "0".repeat(64); assert.ok(has(await analyzeThirdPartyFiles(source, root), "PDF_DIGEST_MISMATCH"));
}));
test("recusa conteúdo sem cabeçalho PDF e metadados acima do limite", async () => fixture(async ({ root, folder, source, receipt }) => {
  const invalid = Buffer.from("plain fictitious text"); await writeFile(join(folder, "receipt.pdf"), invalid);
  receipt.size = invalid.length; receipt.digest = digest(invalid);
  assert.ok(has(await analyzeThirdPartyFiles(source, root), "INVALID_PDF_HEADER"));
  receipt.size = 7 * 1024 * 1024 + 1;
  assert.ok(has(await analyzeThirdPartyFiles(source, root), "INVALID_PDF_METADATA"));
}));
test("recusa travessia, caminhos absolutos, streams Windows e tenant inválido", async () => fixture(async ({ root, source, receipt }) => {
  for (const name of ["../receipt.pdf", "C:\\outside.pdf", "/outside.pdf", "receipt.pdf:stream", "nested/receipt.pdf"]) {
    receipt.storageName = name; assert.ok(has(await analyzeThirdPartyFiles(source, root), "UNSAFE_PDF_PATH"));
  }
  receipt.storageName = "receipt.pdf"; source.invitations[0].tenantId = "../other";
  assert.ok(has(await analyzeThirdPartyFiles(source, root), "UNSAFE_PDF_PATH"));
}));
test("recusa diretório no lugar de PDF e coleção inválida", async () => fixture(async ({ root, folder, source, receipt }) => {
  await mkdir(join(folder, "directory.pdf")); receipt.storageName = "directory.pdf";
  assert.ok(has(await analyzeThirdPartyFiles(source, root), "UNSAFE_PDF_PATH"));
  assert.ok(has(await analyzeThirdPartyFiles({ invitations: {} }, root), "INVALID_PDF_SOURCE"));
}));
test("recusa redirecionamento do diretório do tenant por link ou junction", async () => fixture(async ({ root, source }) => {
  const target = join(root, "outside"); await mkdir(target); await writeFile(join(target, "receipt.pdf"), bytes);
  await symlink(target, join(root, "data/third-party-files/linked"), process.platform === "win32" ? "junction" : "dir");
  source.invitations[0].tenantId = "linked";
  assert.ok(has(await analyzeThirdPartyFiles(source, root), "UNSAFE_PDF_PATH"));
}));
