import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createBackup, restoreIsolated, verifyBackup } from "../scripts/m21-backup.mjs";

const root = mkdtempSync(join(tmpdir(), "sst-hoje-m21-test-"));
const restoredPaths = [];
after(() => {
  for (const path of restoredPaths) rmSync(path, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

function fixture(name) {
  const project = join(root, name), data = join(project, "data");
  mkdirSync(join(data, "document-files", "tenant-ficticio"), { recursive: true });
  writeFileSync(join(data, "clients.json"), "[\"EMPRESA_FICTICIA\"]\n");
  writeFileSync(join(data, "document-files", "tenant-ficticio", "arquivo.pdf"), Buffer.from("PDF-FICTICIO"));
  writeFileSync(join(data, "m21-baseline-tests.txt"), "artefato de teste\n");
  return { project, data };
}

test("backup registra arquivos e hashes e exclui somente artefatos de teste conhecidos", () => {
  const { data } = fixture("valid");
  const destination = join(root, "backup-valid");
  const result = createBackup(data, destination);
  assert.equal(result.files, 2);
  assert.equal(verifyBackup(destination).valid, true);
  assert.throws(() => createBackup(data, destination), /já existe/);
});

test("verificação detecta adulteração e restauração fica isolada em diretório temporário", () => {
  const { data } = fixture("restore");
  const destination = join(root, "backup-restore");
  createBackup(data, destination);
  const restored = restoreIsolated(destination);
  restoredPaths.push(restored.destination);
  assert.match(restored.destination, new RegExp(`^${tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(readFileSync(join(restored.destination, ".sst-m21-isolated-restore.json"), "utf8").includes('"isolated": true'), true);
  assert.equal(readFileSync(join(restored.destination, "data", "clients.json"), "utf8"), "[\"EMPRESA_FICTICIA\"]\n");
  writeFileSync(join(destination, "data", "clients.json"), "conteudo alterado");
  assert.throws(() => verifyBackup(destination), /Integridade não confere/);
});

test("backup recusa a pasta ativa como destino e gravação temporária pendente", () => {
  const { data } = fixture("guards");
  assert.throws(() => createBackup(data, join(data, "backup")), /fora da pasta do aplicativo/);
  writeFileSync(join(data, "clients.json.tmp"), "gravação pendente");
  assert.throws(() => createBackup(data, join(root, "guards-backup")), /Arquivo temporário/);
});
