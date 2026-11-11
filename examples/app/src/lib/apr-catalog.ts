import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

// Acervo (biblioteca) de modelos de APR por etapa operacional.
// Cada modelo traz etapas com perigos, riscos e medidas de controle, e cada item
// pode ser marcado como aplicável / não aplicável na hora do uso — com justificativa
// obrigatória quando não aplicável (mesmo princípio do checklist: nada é pulado em silêncio).
//
// O conteúdo é rascunho até a conferência do responsável técnico (PLH).

export type Applicability = "aplicavel" | "nao_aplicavel" | "a_confirmar";

export type AprStageHazard = {
  id: string;
  hazard: string;
  risk: string;
  controls: string[];
  ppe: string[];
  reference: string;
  defaultApplicability: Applicability;
};

export type AprStage = {
  id: string;
  order: number;
  name: string;
  objective: string;
  hazards: AprStageHazard[];
};

export type AprCatalogModel = {
  id: string;
  title: string;
  summary: string;
  activityGroup: string;
  nr: string;
  stages: AprStage[];
  status: "draft" | "active" | "superseded";
  reviewer: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
  history: { action: "created" | "activated" | "superseded"; actorUserId: string; occurredAt: string }[];
};

export type AprCatalog = { models: AprCatalogModel[] };

const emptyCatalog: AprCatalog = { models: [] };

export function aprCatalogPath() {
  return join(process.cwd(), "data", "apr-catalog.json");
}

export function loadAprCatalog(): AprCatalog {
  try {
    const parsed = JSON.parse(readFileSync(aprCatalogPath(), "utf8")) as AprCatalog;
    return Array.isArray(parsed.models) ? parsed : emptyCatalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCatalog;
    throw error;
  }
}

function writeAprCatalog(catalog: AprCatalog) {
  const path = aprCatalogPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(catalog, null, 2));
}

export function listAprModels(status?: AprCatalogModel["status"]): AprCatalogModel[] {
  const models = loadAprCatalog().models;
  return status ? models.filter((model) => model.status === status) : models;
}

export function listActiveAprModels(): AprCatalogModel[] {
  return loadAprCatalog().models.filter((model) => model.status === "active");
}

export function activateAprModel(id: string, reviewer: string, actorUserId: string): AprCatalogModel {
  if (!reviewer.trim() || reviewer.length < 3) throw new Error("Informe quem conferiu o modelo (responsável técnico).");
  const catalog = loadAprCatalog();
  const model = catalog.models.find((entry) => entry.id === id);
  if (!model) throw new Error("Modelo de APR não encontrado.");
  model.status = "active";
  model.reviewer = reviewer.trim();
  model.reviewedAt = new Date().toISOString();
  model.updatedAt = model.reviewedAt;
  model.history.push({ action: "activated", actorUserId, occurredAt: model.reviewedAt });
  writeAprCatalog(catalog);
  return model;
}

/** Marca a aplicabilidade de um perigo dentro de uma etapa. Não aplicável exige justificativa. */
export function setHazardApplicability(input: {
  modelId: string;
  stageId: string;
  hazardId: string;
  applicability: Applicability;
  justification: string;
  actorUserId: string;
}): AprCatalogModel {
  if (input.applicability === "nao_aplicavel" && input.justification.trim().length < 10) {
    throw new Error("Item não aplicável exige justificativa (mínimo 10 caracteres).");
  }
  const catalog = loadAprCatalog();
  const model = catalog.models.find((entry) => entry.id === input.modelId);
  const stage = model?.stages.find((entry) => entry.id === input.stageId);
  const hazard = stage?.hazards.find((entry) => entry.id === input.hazardId);
  if (!model || !stage || !hazard) throw new Error("Item do acervo não encontrado.");
  hazard.defaultApplicability = input.applicability;
  model.updatedAt = new Date().toISOString();
  writeAprCatalog(catalog);
  return model;
}

/** Contagem para o painel: quantos itens aplicáveis por modelo. */
export function summarizeAprModel(model: AprCatalogModel) {
  const hazards = model.stages.flatMap((stage) => stage.hazards);
  return {
    stages: model.stages.length,
    hazards: hazards.length,
    applicable: hazards.filter((hazard) => hazard.defaultApplicability === "aplicavel").length,
    notApplicable: hazards.filter((hazard) => hazard.defaultApplicability === "nao_aplicavel").length,
    toConfirm: hazards.filter((hazard) => hazard.defaultApplicability === "a_confirmar").length,
  };
}
