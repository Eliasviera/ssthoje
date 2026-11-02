const statuses = new Set(["active", "archived"]);
const actions = new Set(["created", "details_changed", "status_changed"]);
const roles = new Set([
  "consultoria_admin", "sst_tst", "cliente", "terceiro",
  "profissional_habilitado", "medico_coordenador", "saas_master",
]);
const sexValues = new Set(["Feminino", "Masculino", "Não informado"]);
const trainingValues = new Set(["not_informed", "reported_pending_validation"]);
const categories = new Set(["Ruído", "Ergonômico", "Químico", "Biológico", "Acidente", "Outro"]);
const detailFields = new Set([
  "displayName", "sex", "jobTitle", "area", "riskCategories",
  "nr35TrainingStatus", "heightWorkSupervisionTrainingStatus", "scaffoldingAssemblyTrainingStatus",
]);

function normalizedDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new Error("data inválida no snapshot de trabalhadores");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("data inválida no snapshot de trabalhadores");
  return date.toISOString();
}

function validString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function normalizeTrainingStatus(value) {
  return trainingValues.has(value) ? value : "not_informed";
}

export function buildWorkerImportPlan(workers, expectedTenantId, companies) {
  if (!Array.isArray(workers) || !validString(expectedTenantId, 200) || !Array.isArray(companies)) {
    throw new Error("snapshot de trabalhadores ou tenant inválido");
  }

  const companyUnits = new Map(companies
    .filter(company => company?.tenantId === expectedTenantId && Array.isArray(company.units))
    .map(company => [company.id, new Set(company.units.map(unit => unit.id))]));
  const workerIds = new Set();
  const historyIds = new Set();
  const workerRows = [];
  const historyRows = [];

  for (const worker of workers) {
    if (!worker || typeof worker !== "object" || Array.isArray(worker)
      || !validString(worker.id, 200) || workerIds.has(worker.id)
      || worker.tenantId !== expectedTenantId
      || !validString(worker.companyId, 200) || !validString(worker.unitId, 200)
      || !companyUnits.get(worker.companyId)?.has(worker.unitId)
      || !validString(worker.displayName, 200) || !validString(worker.jobTitle, 120)
      || (worker.area !== undefined && worker.area !== null && (typeof worker.area !== "string" || worker.area.length > 120))
      || (worker.sex !== undefined && !sexValues.has(worker.sex))
      || !statuses.has(worker.status)
      || !Array.isArray(worker.riskCategories) || worker.riskCategories.length === 0
      || worker.riskCategories.some(category => !categories.has(category))
      || !Array.isArray(worker.history)) {
      throw new Error("cadastro de trabalhador não corresponde ao contrato de importação");
    }

    workerIds.add(worker.id);
    workerRows.push({
      tenant_id: worker.tenantId,
      id: worker.id,
      company_id: worker.companyId,
      unit_id: worker.unitId,
      display_name: worker.displayName.trim(),
      sex: worker.sex ?? "Não informado",
      job_title: worker.jobTitle.trim(),
      area: worker.area?.trim() || null,
      risk_categories: [...worker.riskCategories],
      nr35_training_status: normalizeTrainingStatus(worker.nr35TrainingStatus),
      height_work_supervision_training_status: normalizeTrainingStatus(worker.heightWorkSupervisionTrainingStatus),
      scaffolding_assembly_training_status: normalizeTrainingStatus(worker.scaffoldingAssemblyTrainingStatus),
      status: worker.status,
      created_at: normalizedDate(worker.createdAt),
      updated_at: normalizedDate(worker.updatedAt),
    });

    for (const entry of worker.history) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || !validString(entry.id, 200) || historyIds.has(entry.id)
        || !actions.has(entry.action) || !validString(entry.actorUserId, 200)
        || !roles.has(entry.actorRole)
        || (entry.fromStatus !== undefined && !statuses.has(entry.fromStatus))
        || (entry.toStatus !== undefined && !statuses.has(entry.toStatus))
        || (entry.changedFields !== undefined && (!Array.isArray(entry.changedFields)
          || entry.changedFields.some(field => !detailFields.has(field))))) {
        throw new Error("histórico do trabalhador não corresponde ao contrato de importação");
      }
      if (entry.action === "created" && (entry.fromStatus !== undefined
        || (entry.toStatus !== undefined && entry.toStatus !== "active")
        || (entry.changedFields?.length ?? 0) > 0)) {
        throw new Error("evento created não corresponde ao estado inicial do contrato");
      }
      if (entry.action === "status_changed" && (!entry.fromStatus || !entry.toStatus
        || entry.fromStatus === entry.toStatus || (entry.changedFields?.length ?? 0) > 0)) {
        throw new Error("evento status_changed não corresponde ao contrato");
      }
      if (entry.action === "details_changed" && (entry.fromStatus !== undefined || entry.toStatus !== undefined
        || !entry.changedFields?.length)) {
        throw new Error("evento details_changed não corresponde ao contrato");
      }

      historyIds.add(entry.id);
      historyRows.push({
        tenant_id: worker.tenantId,
        id: entry.id,
        worker_id: worker.id,
        action: entry.action,
        actor_user_id: entry.actorUserId,
        actor_role: entry.actorRole,
        occurred_at: normalizedDate(entry.occurredAt),
        from_status: entry.fromStatus ?? null,
        to_status: entry.action === "created" ? "active" : entry.toStatus ?? null,
        changed_fields: entry.changedFields ? [...entry.changedFields] : [],
      });
    }
  }

  return { workers: workerRows, history: historyRows };
}
