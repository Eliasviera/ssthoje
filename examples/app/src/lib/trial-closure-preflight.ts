import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Inventário somente leitura. Este módulo não exporta operação de exclusão.
const arrayStores = ["clients.json", "workers.json", "documents.json", "dds.json", "deviations.json", "epi-stock.json", "nonconformities.json", "pgr-drafts.json", "work-permit-drafts.json"] as const;
const collectionStores: Record<string, { required: string[]; optional?: string[] }> = {
  "checklists.json": { required: ["templates", "inspections"] },
  "compliance.json": { required: ["rules", "evaluations"] },
  "epi.json": { required: ["deliveries"], optional: ["offlineSubmissions"] },
  "esocial-mappings.json": { required: ["mappings"] },
  "operations.json": { required: ["deadlines", "preferences", "notices"] },
  "risk-analyses.json": { required: ["records"] },
  "safety-operations.json": { required: ["templates", "aprs"] },
  "third-party.json": { required: ["invitations"], optional: ["integrationApprovals", "integrationSchedules"] },
};
const tenantDirectories = ["document-files", "third-party-files", "pgr-digitalization", "pgr-working", "pgr-item-reviews", "pgr-contractor-annexes"] as const;
const metadataOnly = ["aso.json", "pcmso.json", "audit-log.jsonl", "platform.json", "billing.json", "job-sandbox.json", "integration-sandbox.json", "otp-sandbox.json", "operations-governance.json", "site-content.json", "epi-stock-documents", "epi-invoices", "asaas-inbox"] as const;
const maxJsonBytes = 32 * 1024 * 1024;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const userPattern = new RegExp(`^trial-user-(${uuid})$`);
type Row = Record<string, unknown>;
type Entry = { store: string; status: "missing" | "scanned" | "metadata_only" | "blocked"; matchingRows?: number; files?: number; bytes?: number; sha256?: string };
export class TrialClosurePreflightError extends Error {
  readonly code: "invalid_user" | "registry_unavailable" | "account_not_found" | "invalid_account" | "unsafe_root";
  constructor(code: TrialClosurePreflightError["code"]) {
    super(`Diagnóstico indisponível (${code}). Confira o cadastro de teste e a pasta de dados.`);
    this.code = code;
  }
}
function object(value: unknown): value is Row { return value !== null && typeof value === "object" && !Array.isArray(value); }
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function hash(bytes: string | Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
function readJson(path: string): { value: unknown; sha256: string } {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxJsonBytes) throw new Error("unsafe_file");
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (after.isSymbolicLink() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error("source_changed");
  return { value: JSON.parse(bytes.toString("utf8")) as unknown, sha256: hash(bytes) };
}
function countRows(rows: unknown, tenantId: string): number {
  if (!Array.isArray(rows) || rows.some((row) => !object(row) || typeof row.tenantId !== "string" || !row.tenantId)) throw new Error("invalid_scope");
  return rows.filter((row) => row.tenantId === tenantId).length;
}
function folderStats(path: string): { files: number; bytes: number } {
  let files = 0, bytes = 0, visited = 0;
  function visit(target: string, depth: number) {
    if (++visited > 10_000 || depth > 12) throw new Error("inventory_limit");
    const info = lstatSync(target);
    if (info.isSymbolicLink()) throw new Error("unsafe_link");
    if (info.isFile()) { files++; bytes += info.size; return; }
    if (!info.isDirectory()) throw new Error("unsafe_entry");
    for (const name of readdirSync(target)) visit(join(target, name), depth + 1);
  }
  const top = lstatSync(path);
  if (!top.isDirectory() || top.isSymbolicLink()) throw new Error("unsafe_directory");
  visit(path, 0);
  return { files, bytes };
}

/** Identidade do tenant vem exclusivamente da conta usada no convite.
 * Resultado agregado: não contém nomes, emails, hashes de senha, tokens,
 * prontuários, textos documentais nem nomes de arquivos enviados.
 * Não representa um snapshot transacional ou autorização para apagar.
 */
export function inspectTrialClosure(userId: string, options: { dataDirectory?: string; now?: Date } = {}) {
  const userMatch = typeof userId === "string" ? userPattern.exec(userId) : null;
  if (!userMatch) throw new TrialClosurePreflightError("invalid_user");
  const root = resolve(options.dataDirectory ?? join(process.cwd(), "data"));
  try {
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("unsafe");
  } catch { throw new TrialClosurePreflightError("unsafe_root"); }
  let registry;
  try { registry = readJson(join(root, "invites.json")); }
  catch { throw new TrialClosurePreflightError("registry_unavailable"); }
  if (!Array.isArray(registry.value)) throw new TrialClosurePreflightError("registry_unavailable");
  const accounts = registry.value.filter((record) => object(record) && object(record.account) && record.account.userId === userId);
  if (!accounts.length) throw new TrialClosurePreflightError("account_not_found");
  if (accounts.length !== 1) throw new TrialClosurePreflightError("invalid_account");
  const invitation = accounts[0] as Row;
  const account = invitation.account as Row;
  const tenantId = `trial-tenant-${userMatch[1]}`;
  const activatedAt = typeof account.activatedAt === "string" ? Date.parse(account.activatedAt) : NaN;
  const expiresAt = typeof account.expiresAt === "string" ? Date.parse(account.expiresAt) : NaN;
  const now = options.now ?? new Date();
  if (account.tenantId !== tenantId || typeof invitation.id !== "string" || account.inviteId !== invitation.id
    || typeof invitation.usedAt !== "string" || Date.parse(invitation.usedAt) !== activatedAt
    || !Number.isFinite(activatedAt) || !Number.isFinite(expiresAt) || expiresAt <= activatedAt || !Number.isFinite(now.getTime())
    || (account.extensionsUsed !== 0 && account.extensionsUsed !== 1)
    || registry.value.some((record) => record !== invitation && object(record) && object(record.account) && record.account.tenantId === tenantId)) {
    throw new TrialClosurePreflightError("invalid_account");
  }
  const eligibleByTime = expiresAt <= now.getTime();
  const blockers = new Set<string>([
    "shared_writers_not_locked", "postgres_not_verified", "backup_retention_not_verified", "synthetic_content_not_verified", "deletion_executor_not_implemented",
  ]);
  if (!eligibleByTime) blockers.add("trial_not_expired");
  const entries: Entry[] = [{ store: "invites.json", status: "scanned", matchingRows: 1, sha256: registry.sha256 }];
  function blocked(store: string) { entries.push({ store, status: "blocked" }); blockers.add("source_unsafe_or_invalid"); }
  for (const store of [...arrayStores, ...Object.keys(collectionStores)]) {
    try {
      const snapshot = readJson(join(root, store));
      let count: number;
      if ((arrayStores as readonly string[]).includes(store)) count = countRows(snapshot.value, tenantId);
      else {
        const value = snapshot.value;
        const schema = collectionStores[store];
        if (!object(value) || Object.keys(value).some((key) => ![...schema.required, ...schema.optional ?? []].includes(key))) throw new Error("unmapped_collection");
        count = schema.required.reduce((total, key) => total + countRows(value[key], tenantId), 0);
        for (const key of schema.optional ?? []) if (value[key] !== undefined) count += countRows(value[key], tenantId);
      }
      entries.push({ store, status: "scanned", matchingRows: count, sha256: snapshot.sha256 });
    } catch (error) { if (missing(error)) entries.push({ store, status: "missing" }); else blocked(store); }
  }
  for (const store of tenantDirectories) {
    try {
      const parent = lstatSync(join(root, store));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("unsafe_directory");
      const stats = folderStats(join(root, store, tenantId));
      entries.push({ store, status: "scanned", ...stats });
    } catch (error) { if (missing(error)) entries.push({ store, status: "missing" }); else blocked(store); }
  }
  // Dados médicos e administrativos não são abertos nem interpretados aqui.
  for (const store of metadataOnly) {
    try {
      const info = lstatSync(join(root, store));
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new Error("unsafe_entry");
      entries.push({ store, status: "metadata_only" });
      blockers.add("restricted_or_shared_sources_not_scoped");
    } catch (error) { if (missing(error)) entries.push({ store, status: "missing" }); else blocked(store); }
  }
  const known = new Set([...arrayStores, ...Object.keys(collectionStores), ...tenantDirectories, ...metadataOnly, "invites.json"]);
  const topNames = readdirSync(root);
  const unmappedTopLevelEntries = topNames.filter((name) => !known.has(name)).length;
  if (unmappedTopLevelEntries) blockers.add("unmapped_top_level_entries");
  if (topNames.some((name) => name.endsWith(".tmp") || name.endsWith(".lock"))) blockers.add("pending_write_or_lock");
  // A leitura repetida detecta alteração do cadastro durante a inspeção;
  // não converte os demais arquivos numa transação nem congela os escritores.
  try { if (readJson(join(root, "invites.json")).sha256 !== registry.sha256) blockers.add("registry_changed"); }
  catch { blockers.add("registry_changed"); }
  return {
    schema: "sst-trial-closure-preflight-v1" as const,
    mode: "read_only" as const,
    inspectedAt: now.toISOString(),
    eligibleByTime,
    deletionAllowed: false as const,
    trial: { expiresAt: new Date(expiresAt).toISOString(), extensionsUsed: account.extensionsUsed },
    entries,
    unmappedTopLevelEntries,
    blockers: [...blockers].sort(),
    // Inclui as fontes de todos os tenants compartilhados sem revelar conteúdo.
    sourceFingerprint: hash(JSON.stringify(entries)),
  };
}
