import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeThirdPartyMigration } from "../src/lib/third-party-migration-analysis.mjs";
import { analyzeThirdPartyFiles } from "../src/lib/third-party-file-analysis.mjs";
import { validateThirdPartySource } from "../src/lib/third-party-source-contract.mjs";
import { validateThirdPartyAuxiliarySources } from "../src/lib/third-party-auxiliary-contract.mjs";

const names = ["third-party.json", "clients.json", "compliance.json", "documents.json", "audit-log.jsonl"];
const hash = bytes => bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
async function readSource(name) {
  try { return await readFile(join(process.cwd(), "data", name)); }
  catch (error) { if (name === "documents.json" && error.code === "ENOENT") return null; throw error; }
}

// Leitor injetável permite simular alteração concorrente sem tocar em dados ativos.
export async function inspectThirdPartySource(read = readSource, inspectFiles = analyzeThirdPartyFiles) {
  const before = await Promise.all(names.map(name => read(name)));
  const [source, clients, compliance] = before.slice(0, 3).map(bytes => JSON.parse(bytes.toString("utf8")));
  const documents = before[3] === null ? [] : JSON.parse(before[3].toString("utf8"));
  if (!compliance || typeof compliance !== "object" || Array.isArray(compliance) || !Array.isArray(compliance.rules) || !Array.isArray(compliance.evaluations)) throw new Error("INVALID_COMPLIANCE_SOURCE");
  const audit = before[4].toString("utf8").split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const report = analyzeThirdPartyMigration(source, clients, audit, compliance, documents);
  const contract = validateThirdPartySource(source);
  const auxiliary = validateThirdPartyAuxiliarySources({ source, clients, compliance, documents, audit });
  if (before[3] === null) report.issues.push({ severity: "warning", code: "INTERNAL_DOCUMENT_SOURCE_ABSENT", count: 1 });
  const files = await inspectFiles(source);
  const after = await Promise.all(names.map(name => read(name)));
  const stable = before.every((bytes, index) => hash(bytes) === hash(after[index]));
  const sourceManifest = {
    version: 1,
    contractVersion: contract.contractVersion,
    auxiliaryContractVersion: auxiliary.auxiliaryContractVersion,
    files: names.map((name, index) => ({ name, present: before[index] !== null, sha256: hash(before[index]) })),
    totals: {
      tenants: new Set((Array.isArray(source?.invitations) ? source.invitations : []).filter(value => value && typeof value.tenantId === "string").map(value => value.tenantId)).size,
      invitations: Array.isArray(source?.invitations) ? source.invitations.length : 0,
      sourceAuditRows: audit.length,
      internalDocuments: documents.length,
    },
  };
  return { ...report, files, sourceManifest, contractVersion: contract.contractVersion, auxiliaryContractVersion: auxiliary.auxiliaryContractVersion, pendingChecks: report.pendingChecks.filter(code => !["PDF_BYTES_AND_SAFE_PATHS", "COMPLETE_SOURCE_CONTRACT"].includes(code)), sourceStable: stable,
    sourceHashes: Object.fromEntries(names.map((name, index) => [name, hash(before[index])])),
    blockers: report.blockers + files.blockers + contract.blockers + auxiliary.blockers + (stable ? 0 : 1),
    issues: [...report.issues, ...contract.issues, ...auxiliary.issues, ...files.issues, ...(stable ? [] : [{ severity: "blocker", code: "SOURCE_CHANGED_DURING_READ", count: 1 }])],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length > 2) {
    console.error("Comando somente leitura, sem argumentos ou modo de aplicação.");
    process.exitCode = 2;
  } else {
    try {
      const report = await inspectThirdPartySource();
      console.log(JSON.stringify(report));
      if (report.blockers) process.exitCode = 1;
    } catch {
      console.error("Análise não concluída: origem ausente, inválida ou inacessível. Nenhum conteúdo foi exibido ou alterado.");
      process.exitCode = 1;
    }
  }
}
