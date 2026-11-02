import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzePgrAuditMigration, analyzePgrMigration } from "../src/lib/pgr-legacy-migration.ts";

if (process.argv.includes("--apply")) {
  console.error("Este comando é somente leitura; não existe modo de importação.");
  process.exit(2);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseScopes(value) {
  if (!Array.isArray(value)) throw new Error("origem de empresas inválida");
  const scopes = new Set();
  for (const company of value) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) {
      throw new Error("origem de empresas inválida");
    }
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("origem de unidades inválida");
      scopes.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return scopes;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function summarizeIssues(issues) {
  const counts = new Map();
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => {
    const [severity, code] = key.split(":");
    return { severity, code, count };
  });
}

const dataDir = join(process.cwd(), "data");
try {
  const [pgrBytes, clientsBytes, auditBytes] = await Promise.all([
    readFile(join(dataDir, "pgr-drafts.json")),
    readFile(join(dataDir, "clients.json")),
    readFile(join(dataDir, "audit-log.jsonl")),
  ]);
  const pgr = JSON.parse(pgrBytes.toString("utf8"));
  const clients = JSON.parse(clientsBytes.toString("utf8"));
  const audit = parseJsonLines(auditBytes.toString("utf8"));
  const report = analyzePgrMigration(pgr, parseScopes(clients));
  const pgrAudit = analyzePgrAuditMigration(audit, pgr);
  const pgrAuditIssues = pgrAudit.issues;
  console.log(JSON.stringify({
    mode: "read-only-dry-run",
    sourceHashes: { pgrDrafts: hash(pgrBytes), clientScopes: hash(clientsBytes), auditLog: hash(auditBytes) },
    ...report,
    pgrAudit: { ...pgrAudit, issues: summarizeIssues(pgrAuditIssues) },
  }));
  if (report.issues.some((issue) => issue.severity === "blocker") || pgrAudit.issues.some((issue) => issue.severity === "blocker")) process.exitCode = 1;
} catch {
  console.error("Pré-check PGR não concluído: origem ausente ou inválida; nenhum conteúdo foi exibido.");
  process.exitCode = 1;
}
