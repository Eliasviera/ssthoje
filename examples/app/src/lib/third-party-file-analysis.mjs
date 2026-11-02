import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_BYTES = 7 * 1024 * 1024; // Limite já usado pelo recebimento local.
const identity = info => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
const failure = code => Object.assign(new Error(code), { analysisCode: code });

async function checkedPath(app, tenant, storageName) {
  const canonicalApp = await realpath(app);
  const parts = [join(app, "data"), join(app, "data/third-party-files"), join(app, "data/third-party-files", tenant), join(app, "data/third-party-files", tenant, storageName)];
  const expected = [join(canonicalApp, "data"), join(canonicalApp, "data/third-party-files"), join(canonicalApp, "data/third-party-files", tenant), join(canonicalApp, "data/third-party-files", tenant, storageName)];
  const identities = [];
  for (const [index, path] of parts.entries()) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (index < 3 ? !info.isDirectory() : !info.isFile())) throw failure("UNSAFE_PDF_PATH");
    if (await realpath(path) !== expected[index]) {
      // A comparação com a raiz canônica também detecta redirecionamento dos pais.
      throw failure("UNSAFE_PDF_PATH");
    }
    identities.push(identity(info));
  }
  return { path: parts[3], identities };
}

// Somente bytes/hash: não extrai texto, não executa o PDF e não grava arquivos.
export async function analyzeThirdPartyFiles(source, appDirectory = process.cwd()) {
  const app = resolve(appDirectory), problems = new Map();
  const counts = { checked: 0, verified: 0, verifiedBytes: 0 };
  const add = code => problems.set(code, (problems.get(code) ?? 0) + 1);
  if (!source || !Array.isArray(source.invitations)) add("INVALID_PDF_SOURCE");
  for (const invite of Array.isArray(source?.invitations) ? source.invitations : []) {
    if (!invite || !Array.isArray(invite.receipts)) { add("INVALID_PDF_SOURCE"); continue; }
    for (const receipt of invite.receipts) {
      counts.checked++;
      let handle;
      try {
        if (typeof invite.tenantId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(invite.tenantId) || !receipt || typeof receipt.storageName !== "string" || !/^[a-zA-Z0-9_-]+\.pdf$/.test(receipt.storageName)) throw failure("UNSAFE_PDF_PATH");
        if (!Number.isSafeInteger(receipt.size) || receipt.size < 5 || receipt.size > MAX_BYTES || typeof receipt.digest !== "string" || !/^[a-f0-9]{64}$/.test(receipt.digest)) throw failure("INVALID_PDF_METADATA");
        const before = await checkedPath(app, invite.tenantId, receipt.storageName);
        handle = await open(before.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const initial = await handle.stat();
        if (!initial.isFile() || identity(initial) !== before.identities[3]) throw failure("PDF_CHANGED_DURING_READ");
        if (initial.size !== receipt.size) throw failure("PDF_SIZE_MISMATCH");
        const opened = await checkedPath(app, invite.tenantId, receipt.storageName);
        if (opened.identities.some((value, index) => value !== before.identities[index])) throw failure("PDF_CHANGED_DURING_READ");
        const digest = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
        let bytes = 0, header = Buffer.alloc(0);
        for (;;) {
          const result = await handle.read(buffer, 0, buffer.length, null);
          if (!result.bytesRead) break;
          const chunk = buffer.subarray(0, result.bytesRead);
          if (header.length < 5) header = Buffer.concat([header, chunk.subarray(0, 5 - header.length)]);
          bytes += chunk.length;
          if (bytes > receipt.size || bytes > MAX_BYTES) throw failure("PDF_CHANGED_DURING_READ");
          digest.update(chunk);
        }
        const after = await checkedPath(app, invite.tenantId, receipt.storageName);
        if (identity(await handle.stat()) !== identity(initial) || after.identities.some((value, index) => value !== before.identities[index]) || bytes !== receipt.size) throw failure("PDF_CHANGED_DURING_READ");
        if (header.toString("ascii") !== "%PDF-") throw failure("INVALID_PDF_HEADER");
        if (digest.digest("hex") !== receipt.digest) throw failure("PDF_DIGEST_MISMATCH");
        counts.verified++; counts.verifiedBytes += bytes;
      } catch (error) {
        add(error.analysisCode ?? (error.code === "ENOENT" ? "PDF_FILE_MISSING" : error.code === "ELOOP" ? "UNSAFE_PDF_PATH" : "PDF_FILE_UNREADABLE"));
      } finally {
        if (handle) await handle.close();
      }
    }
  }
  const issues = [...problems].map(([code, count]) => ({ severity: "blocker", code, count })).sort((a, b) => a.code.localeCompare(b.code));
  return { counts, issues, blockers: issues.reduce((sum, item) => sum + item.count, 0) };
}
