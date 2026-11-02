import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildWorkerImportPlan } from "./worker-import-plan.mjs";

const dataDirArg = process.argv.find((arg) => arg.startsWith("--data-dir="))?.slice("--data-dir=".length);
const dataDir = dataDirArg ? resolve(dataDirArg) : join(process.cwd(), "data");
const statuses = new Set(["active", "archived"]);
const datePattern = /^\d{4}-\d{2}-\d{2}T/;
const workerTrainingStatuses = new Set(["not_informed", "reported_pending_validation"]);
const workerSexes = new Set(["Feminino", "Masculino", "Não informado"]);
const workerHistoryActions = new Set(["created", "details_changed", "status_changed"]);
const tenantRoles = new Set(["consultoria_admin", "sst_tst", "cliente", "terceiro", "profissional_habilitado", "medico_coordenador", "saas_master"]);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validDate(value) {
  return typeof value === "string" && datePattern.test(value) && Number.isFinite(Date.parse(value));
}

function readJson(raw, label) {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} não pôde ser interpretado como JSON`);
  }
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.values()].filter((count) => count > 1);
  return { groups: groups.length, extraOccurrences: groups.reduce((sum, count) => sum + count - 1, 0) };
}

function validateCompanies(companies) {
  if (!Array.isArray(companies)) throw new Error("clients.json deve conter uma lista");
  const companyIds = new Set();
  const unitIds = new Set();
  const companyById = new Map();
  const cnpjEntries = new Map();
  const tenantIds = new Set();
  let active = 0;
  let archived = 0;
  let units = 0;
  let invalidCnpjs = 0;

  for (const company of companies) {
    if (!company || typeof company !== "object" || Array.isArray(company)
      || typeof company.id !== "string" || !company.id.trim()
      || typeof company.tenantId !== "string" || !company.tenantId.trim()
      || typeof company.legalName !== "string" || !company.legalName.trim()
      || !statuses.has(company.status)
      || !validDate(company.createdAt) || !validDate(company.updatedAt)
      || !Array.isArray(company.units)) {
      throw new Error("um cadastro de empresa não corresponde ao contrato esperado");
    }
    if (companyIds.has(company.id)) throw new Error("há IDs de empresa repetidos");
    companyIds.add(company.id);
    companyById.set(company.id, company);
    tenantIds.add(company.tenantId);
    if (company.status === "active") active += 1;
    else archived += 1;

    for (const unit of company.units) {
      if (!unit || typeof unit !== "object" || Array.isArray(unit)
        || typeof unit.id !== "string" || !unit.id.trim()
        || typeof unit.cnpj !== "string"
        || typeof unit.name !== "string" || !unit.name.trim()
        || typeof unit.cityState !== "string") {
        throw new Error("uma unidade não corresponde ao contrato esperado");
      }
      if (unitIds.has(unit.id)) throw new Error("há IDs de unidade repetidos");
      unitIds.add(unit.id);
      const normalizedCnpj = unit.cnpj.replace(/\D/g, "");
      if (normalizedCnpj.length !== 14) invalidCnpjs += 1;
      const key = `${company.tenantId}:${normalizedCnpj}`;
      const entries = cnpjEntries.get(key) ?? [];
      entries.push(company.status);
      cnpjEntries.set(key, entries);
      units += 1;
    }
  }

  const duplicateCnpjs = countDuplicates([...cnpjEntries.entries()].flatMap(([key, entries]) => entries.map(() => key)));
  let activeArchivedDuplicateGroups = 0;
  for (const entries of cnpjEntries.values()) {
    if (entries.includes("active") && entries.includes("archived")) activeArchivedDuplicateGroups += 1;
  }

  return {
    companies,
    companyById,
    companyIds,
    tenantIds,
    summary: { total: companies.length, active, archived, units, invalidCnpjs, duplicateCnpjs, activeArchivedDuplicateGroups },
  };
}

function validateWorkers(workers, companies) {
  if (!Array.isArray(workers)) throw new Error("workers.json deve conter uma lista");
  const workerIds = new Set();
  let unresolvedReferences = 0;
  let archivedCompanyReferences = 0;
  let active = 0;
  let archived = 0;
  let historyEntries = 0;
  let legacyTrainingStatuses = 0;
  const historyActions = new Map();
  const workerById = new Map();
  for (const worker of workers) {
    if (!worker || typeof worker !== "object" || Array.isArray(worker)
      || typeof worker.id !== "string" || !worker.id.trim()
      || typeof worker.tenantId !== "string" || !worker.tenantId.trim()
      || typeof worker.companyId !== "string" || !worker.companyId.trim()
      || typeof worker.unitId !== "string" || !worker.unitId.trim()
      || typeof worker.displayName !== "string" || !worker.displayName.trim()
      || typeof worker.jobTitle !== "string" || !worker.jobTitle.trim()
      || !statuses.has(worker.status)
      || !validDate(worker.createdAt) || !validDate(worker.updatedAt)
      || !Array.isArray(worker.riskCategories) || !Array.isArray(worker.history)
      || (worker.sex !== undefined && !workerSexes.has(worker.sex))) {
      throw new Error("um cadastro de trabalhador não corresponde ao contrato esperado");
    }
    if (workerIds.has(worker.id)) throw new Error("há IDs de trabalhador repetidos");
    workerIds.add(worker.id);
    workerById.set(worker.id, worker);
    if (worker.status === "active") active += 1;
    else archived += 1;
    for (const field of ["nr35TrainingStatus", "heightWorkSupervisionTrainingStatus", "scaffoldingAssemblyTrainingStatus"]) {
      if (!workerTrainingStatuses.has(worker[field])) legacyTrainingStatuses += 1;
    }
    for (const entry of worker.history) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || typeof entry.id !== "string" || !entry.id.trim()
        || !workerHistoryActions.has(entry.action)
        || typeof entry.actorUserId !== "string" || !entry.actorUserId.trim()
        || !tenantRoles.has(entry.actorRole)
        || !validDate(entry.occurredAt)
        || (entry.fromStatus !== undefined && !statuses.has(entry.fromStatus))
        || (entry.toStatus !== undefined && !statuses.has(entry.toStatus))
        || (entry.changedFields !== undefined && (!Array.isArray(entry.changedFields)
          || entry.changedFields.some((field) => !["displayName", "sex", "jobTitle", "area", "riskCategories",
            "nr35TrainingStatus", "heightWorkSupervisionTrainingStatus", "scaffoldingAssemblyTrainingStatus"].includes(field))))) {
        throw new Error("um evento do histórico de trabalhadores não corresponde ao contrato esperado");
      }
      historyEntries += 1;
      historyActions.set(entry.action, (historyActions.get(entry.action) ?? 0) + 1);
    }
    const company = companies.companyById.get(worker.companyId);
    if (!company || company.tenantId !== worker.tenantId
      || !company.units.some((unit) => unit.id === worker.unitId)) {
      unresolvedReferences += 1;
    } else if (company.status === "archived") {
      archivedCompanyReferences += 1;
    }
  }
  return {
    total: workers.length, active, archived, unresolvedReferences, archivedCompanyReferences,
    historyEntries, historyActions: Object.fromEntries([...historyActions.entries()].sort()), legacyTrainingStatuses,
    workerById,
  };
}

function validateAudit(text, companies, workers) {
  const seenIds = new Set();
  const actions = new Map();
  let total = 0;
  let withoutTargetId = 0;
  let invalidTenantReferences = 0;
  let unresolvedWorkerTargets = 0;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`audit-log.jsonl contém JSON inválido na linha ${index + 1}`);
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const isClientEvent = typeof event.action === "string" && event.action.startsWith("client.");
    const isWorkerEvent = typeof event.action === "string" && event.action.startsWith("worker.");
    if (!isClientEvent && !isWorkerEvent) continue;
    if (typeof event.id !== "string" || !event.id.trim()
      || typeof event.tenantId !== "string" || !event.tenantId.trim()
      || typeof event.actorUserId !== "string" || !event.actorUserId.trim()
      || typeof event.actorRole !== "string" || !event.actorRole.trim()
      || !validDate(event.occurredAt)) {
      throw new Error("um evento client.* ou worker.* não corresponde ao contrato esperado");
    }
    if (seenIds.has(event.id)) throw new Error("há IDs de eventos client.* repetidos");
    seenIds.add(event.id);
    total += 1;
    actions.set(event.action, (actions.get(event.action) ?? 0) + 1);
    if (typeof event.targetId !== "string" || !event.targetId.trim()) withoutTargetId += 1;
    if (isClientEvent && !companies.tenantIds.has(event.tenantId)) invalidTenantReferences += 1;
    if (isWorkerEvent && typeof event.targetId === "string" && event.targetId.trim()) {
      const worker = workers.workerById.get(event.targetId);
      if (!worker || worker.tenantId !== event.tenantId) unresolvedWorkerTargets += 1;
    }
  }
  return {
    total, actions: Object.fromEntries([...actions.entries()].sort()), withoutTargetId,
    invalidTenantReferences, unresolvedWorkerTargets,
  };
}

try {
  const [companiesRaw, workersRaw, auditRaw] = await Promise.all([
    readFile(join(dataDir, "clients.json")),
    readFile(join(dataDir, "workers.json")),
    readFile(join(dataDir, "audit-log.jsonl")),
  ]);
  const companySnapshot = readJson(companiesRaw, "clients.json");
  const workerSnapshot = readJson(workersRaw, "workers.json");
  const companies = validateCompanies(companySnapshot);
  const workers = validateWorkers(workerSnapshot, companies);
  const audit = validateAudit(auditRaw.toString("utf8"), companies, workers);
  const resolvedWorkers = workerSnapshot.filter((worker) => {
    const company = companies.companyById.get(worker.companyId);
    return company?.tenantId === worker.tenantId
      && company.units.some((unit) => unit.id === worker.unitId);
  });
  const importPlan = [...new Set(resolvedWorkers.map((worker) => worker.tenantId))]
    .map((tenantId) => buildWorkerImportPlan(
      resolvedWorkers.filter((worker) => worker.tenantId === tenantId),
      tenantId,
      companySnapshot,
    ))
    .reduce((total, plan) => ({
      workers: total.workers + plan.workers.length,
      history: total.history + plan.history.length,
    }), { workers: 0, history: 0 });
  const duplicate = companies.summary.duplicateCnpjs;

  console.log("Empresas/Unidades: dry-run concluído; nenhuma gravação ou conexão com PostgreSQL foi realizada.");
  console.log(`Empresas: ${companies.summary.total} (ativas=${companies.summary.active}, arquivadas=${companies.summary.archived}); unidades=${companies.summary.units}`);
  console.log(`Integridade: IDs de empresa/unidade/trabalhador únicos; CNPJs com tamanho inválido=${companies.summary.invalidCnpjs}`);
  console.log(`CNPJs repetidos no tenant: ${duplicate.groups} grupos, ${duplicate.extraOccurrences} ocorrências extras; grupos ativo/arquivado=${companies.summary.activeArchivedDuplicateGroups}`);
  console.log(`Trabalhadores: ${workers.total} (ativos=${workers.active}, arquivados=${workers.archived}); referências empresa/unidade/tenant sem correspondência=${workers.unresolvedReferences}; referências a empresa arquivada=${workers.archivedCompanyReferences}`);
  console.log(`Histórico de trabalhadores: ${workers.historyEntries} eventos (${JSON.stringify(workers.historyActions)}); campos de treinamento que usam o padrão de leitura do runtime=${workers.legacyTrainingStatuses}`);
  const planStatus = workers.unresolvedReferences === 0 ? "completo" : "incompleto; referências inválidas foram excluídas do mapeamento";
  console.log(`Plano de importação candidato ${planStatus}: ${importPlan.workers}/${workers.total} trabalhadores e ${importPlan.history} eventos individuais mapeados; somente memória, sem escrita.`);
  console.log(`Auditoria client.*/worker.*: ${audit.total} eventos (${JSON.stringify(audit.actions)}); sem targetId=${audit.withoutTargetId}; tenant sem empresa=${audit.invalidTenantReferences}; alvos worker.* sem correspondência=${audit.unresolvedWorkerTargets}`);
  console.log(`SHA-256: clients.json=${digest(companiesRaw)}; workers.json=${digest(workersRaw)}; audit-log.jsonl=${digest(auditRaw)}`);
  console.log("Nomes, CNPJs, contatos, IDs e dados pessoais foram omitidos da saída.");
} catch (error) {
  console.error(`Dry-run interrompido: ${error instanceof Error ? error.message : "falha inesperada"}`);
  process.exitCode = 1;
}
