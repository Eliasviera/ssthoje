import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, truncateSync } from "node:fs";
import { join } from "node:path";
// Next resolve este marcador na aplicação. Somente neste processo de teste, ele é vazio.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { createDocumentVersion, replaceDocumentVersion, archiveDocumentGroup, listDocumentGroupsForTenant } = await import("../src/lib/document-store.ts");
const { tenantStorageBytes, MB } = await import("../src/lib/storage-quota.ts");
test("documentos: quota bloqueia criação e versão sem alterar histórico; arquivo arquivado segue ocupando espaço", () => {
  const original = process.cwd(); mkdirSync(join(original, "data"), { recursive: true });
  process.chdir(mkdtempSync(join(original, "data", "document-quota-tests-")));
  try {
    const tenantId = "tenant-horizonte", actor = { userId: "sst-demo-user", role: "consultoria_admin" };
    const bytes = new TextEncoder().encode("%PDF-1.4\nTeste fictício\n%%EOF");
    const input = { tenantId, companyId: "company-a", unitId: "unit-a", title: "Documento fictício", kind: "PGR", originalFileName: "ficticio.pdf", size: bytes.length, validUntil: "", uploadedBy: actor.userId };
    const document = createDocumentVersion(input, bytes, actor);
    const dir = join("data", "third-party-files", tenantId); mkdirSync(dir, { recursive: true });
    const fill = join(dir, "old.pdf"); writeFileSync(fill, ""); truncateSync(fill, 100 * MB - bytes.length);
    const before = readFileSync("data/documents.json", "utf8");
    assert.throws(() => createDocumentVersion(input, bytes, actor), /Limite/);
    assert.throws(() => replaceDocumentVersion(document.groupId, bytes, "nova.pdf", bytes.length, actor, tenantId), /Limite/);
    assert.equal(readFileSync("data/documents.json", "utf8"), before);
    assert.equal(tenantStorageBytes(tenantId), 100 * MB);
    assert.equal(listDocumentGroupsForTenant(tenantId)[0].versions.length, 1);
    assert.ok(archiveDocumentGroup(document.groupId, tenantId, actor));
    assert.equal(tenantStorageBytes(tenantId), 100 * MB);
  } finally { process.chdir(original); }
});
