import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const FORMAT = "sst-hoje-local-backup-v1";
const MARKER = ".sst-m21-isolated-restore.json";

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function assertNoLinks(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${path}`);
  return stat;
}

function ignoredRelativePath(path) {
  const parts = path.split(sep);
  return parts.some((part) => /-tests-[A-Za-z0-9_-]+$/i.test(part)) ||
    (/^m\d{2}-.+tests?[^/\\]*\.txt$/i.test(path) || /^m21-baseline-tests\.txt$/i.test(path));
}

function inventory(root, { backupData = false } = {}) {
  const entries = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = assertNoLinks(path);
      const key = relative(root, path);
      if (backupData && ignoredRelativePath(key)) continue;
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        if (name.endsWith(".tmp")) throw new Error(`Arquivo temporário indica gravação interrompida: ${path}`);
        const bytes = readFileSync(path);
        entries.push({ path: key.split(sep).join("/"), size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
      } else throw new Error(`Tipo de arquivo não suportado: ${path}`);
    }
  }
  visit(root);
  return entries;
}

function assertDestinationOutsideData(sourceData, destination) {
  const source = realpathSync(resolve(sourceData)), target = resolve(destination);
  const project = basename(source).toLowerCase() === "data" ? dirname(source) : null;
  if (inside(source, target) || inside(target, source) || (project && (inside(project, target) || inside(target, project)))) {
    throw new Error("O destino do backup precisa ficar fora da pasta do aplicativo e de data/.");
  }
  if (existsSync(target)) throw new Error("O destino já existe; escolha uma pasta nova.");
  const parent = realpathSync(dirname(target));
  if (inside(source, parent) || (project && inside(project, parent))) throw new Error("O destino precisa ficar fora da pasta do aplicativo.");
}

export function createBackup(sourceData, destination) {
  const source = resolve(sourceData), target = resolve(destination);
  if (!existsSync(source) || !assertNoLinks(source).isDirectory()) throw new Error("A pasta data/ não está disponível.");
  assertDestinationOutsideData(source, target);
  const before = inventory(source, { backupData: true });
  mkdirSync(target, { recursive: false });
  try {
    const copiedData = join(target, "data");
    cpSync(source, copiedData, { recursive: true, filter: (path) => !ignoredRelativePath(relative(source, path)) });
    const copied = inventory(copiedData);
    if (JSON.stringify(before) !== JSON.stringify(copied)) throw new Error("Os arquivos mudaram durante a cópia; backup não confirmado.");
    const after = inventory(source, { backupData: true });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Os dados mudaram durante a cópia; backup não confirmado.");
    const manifest = { format: FORMAT, createdAt: new Date().toISOString(), files: copied };
    writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    verifyBackup(target);
    return { destination: target, files: copied.length, bytes: copied.reduce((sum, file) => sum + file.size, 0) };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} A pasta de destino parcial foi preservada para inspeção: ${target}`);
  }
}

export function verifyBackup(backupPath) {
  const root = resolve(backupPath);
  if (!assertNoLinks(root).isDirectory()) throw new Error("Backup inválido.");
  if (!assertNoLinks(join(root, "data")).isDirectory()) throw new Error("Pasta de dados do backup inválida.");
  const manifestPath = join(root, "manifest.json");
  if (!assertNoLinks(manifestPath).isFile()) throw new Error("Manifesto ausente.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.format !== FORMAT || !Array.isArray(manifest.files)) throw new Error("Formato de backup desconhecido.");
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").some((part) => !part || part === "." || part === "..") || seen.has(file.path)) {
      throw new Error("Manifesto contém caminho inválido ou duplicado.");
    }
    seen.add(file.path);
    const path = join(root, "data", ...file.path.split("/"));
    if (!inside(join(root, "data"), path) || !assertNoLinks(path).isFile()) throw new Error(`Arquivo ausente ou inválido: ${file.path}`);
    const bytes = readFileSync(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== file.size || digest !== file.sha256) throw new Error(`Integridade não confere: ${file.path}`);
  }
  const actual = inventory(join(root, "data"));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error("O backup contém arquivos extras ou divergentes.");
  const rootEntries = readdirSync(root).sort();
  if (JSON.stringify(rootEntries) !== JSON.stringify(["data", "manifest.json"])) throw new Error("A pasta de backup contém itens extras.");
  return { valid: true, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.size, 0) };
}

export function restoreIsolated(backupPath) {
  const verification = verifyBackup(backupPath);
  const tempRoot = realpathSync(tmpdir());
  const target = join(tempRoot, `sst-hoje-m21-restore-${randomUUID()}`);
  if (!inside(tempRoot, target) || existsSync(target)) throw new Error("Não foi possível criar destino temporário isolado.");
  mkdirSync(target, { recursive: false });
  try {
    cpSync(join(resolve(backupPath), "data"), join(target, "data"), { recursive: true });
    writeFileSync(join(target, MARKER), `${JSON.stringify({ format: FORMAT, isolated: true, restoredAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx" });
    const restored = inventory(join(target, "data"));
    const original = JSON.parse(readFileSync(join(resolve(backupPath), "manifest.json"), "utf8")).files;
    if (JSON.stringify(restored) !== JSON.stringify(original)) throw new Error("A verificação da restauração divergiu do manifesto.");
    return { destination: target, files: verification.files, bytes: verification.bytes };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} O destino isolado foi preservado: ${target}`);
  }
}

function usage() {
  console.error("Uso:\n  node scripts/m21-backup.mjs backup <destino-novo> --confirm-app-stopped\n  node scripts/m21-backup.mjs verify <pasta-backup>\n  node scripts/m21-backup.mjs restore <pasta-backup>");
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [command, first, flag] = process.argv.slice(2);
  try {
    if (command === "backup" && first && flag === "--confirm-app-stopped") {
      const result = createBackup(join(process.cwd(), "data"), first);
      console.log(`Backup criado: ${result.files} arquivos, ${result.bytes} bytes em ${result.destination}`);
    } else if (command === "verify" && first) {
      const result = verifyBackup(first);
      console.log(`Integridade confirmada: ${result.files} arquivos, ${result.bytes} bytes.`);
    } else if (command === "restore" && first) {
      const result = restoreIsolated(first);
      console.log(`Restauração isolada conferida: ${result.files} arquivos em ${result.destination}`);
    } else usage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
