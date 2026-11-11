import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID as cryptoRandomUUID } from "node:crypto";

// Acervo de temas para o Diálogo Diário de Segurança (DDS).
// Cada tema traz: título, resumo, orientação completa para ser lida com a equipe,
// pergunta de verificação, referência normativa e responsável pela revisão.
//
// Princípio (mesmo do AGENTS.md): orientação técnica é conteúdo, não constante.
// Quem aprova é o responsável técnico (PLH); o sistema não decide nem inventa.

import type { DdsTopic, DdsTopicCatalog } from "./dds-topic-types";
export type { DdsTopic, DdsTopicCatalog } from "./dds-topic-types";


// Cargos que conduzem o DDS por praxe (liderança operacional) e por exceção (SST).
// Consumido pela tela para priorizar a liderança no seletor de responsável.


const emptyCatalog: DdsTopicCatalog = { topics: [] };

export function ddsTopicCatalogPath() {
  return join(process.cwd(), "data", "dds-topics.json");
}

export function loadDdsTopicCatalog(): DdsTopicCatalog {
  try {
    const parsed = JSON.parse(readFileSync(ddsTopicCatalogPath(), "utf8")) as DdsTopicCatalog;
    return Array.isArray(parsed.topics) ? parsed : emptyCatalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCatalog;
    throw error;
  }
}

function writeDdsTopicCatalog(catalog: DdsTopicCatalog) {
  const path = ddsTopicCatalogPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(catalog, null, 2));
}

export function listDdsTopics(tenantScope: boolean, status?: DdsTopic["status"]): DdsTopic[] {
  // O acervo é global (mesmo conjunto para a demonstração); tenantScope é mantido
  // para preparar o isolamento futuro sem mudar a assinatura.
  const topics = loadDdsTopicCatalog().topics;
  return status ? topics.filter((topic) => topic.status === status) : topics;
}

export function listActiveDdsTopics(): DdsTopic[] {
  return loadDdsTopicCatalog().topics.filter((topic) => topic.status === "active");
}

export function createDdsTopic(input: {
  title: string;
  summary: string;
  guidance: string;
  verificationQuestion: string;
  riskGroup?: string;
  sourceItem: string;
  actorUserId: string;
}): DdsTopic {
  if (!input.title.trim() || input.title.length > 160) throw new Error("Título do tema obrigatório (até 160 caracteres).");
  if (!input.summary.trim() || input.summary.length > 180) throw new Error("Resumo obrigatório, objetivo (até 180 caracteres).");
  if (!input.guidance.trim() || input.guidance.length < 40 || input.guidance.length > 420) throw new Error("A orientação precisa ser objetiva: entre 40 e 420 caracteres.");
  if (!input.verificationQuestion.trim() || input.verificationQuestion.length > 180) throw new Error("Pergunta de verificação obrigatória, objetiva (até 180 caracteres).");
  if (!input.sourceItem.trim() || input.sourceItem.length > 120) throw new Error("Informe a referência normativa (ex.: NR-6).");
  const now = new Date().toISOString();
  const topic: DdsTopic = {
    id: `dds-topic-${cryptoRandomUUID()}`,
    title: input.title.trim(),
    summary: input.summary.trim(),
    guidance: input.guidance.trim(),
    verificationQuestion: input.verificationQuestion.trim(),
    riskGroup: input.riskGroup?.trim() || undefined,
    sourceItem: input.sourceItem.trim(),
    status: "draft",
    reviewer: "",
    reviewedAt: "",
    createdAt: now,
    updatedAt: now,
    history: [{ action: "created", actorUserId: input.actorUserId, occurredAt: now }],
  };
  const catalog = loadDdsTopicCatalog();
  catalog.topics.push(topic);
  writeDdsTopicCatalog(catalog);
  return topic;
}

/** Ativa um tema após conferência do responsável técnico. */
export function activateDdsTopic(id: string, reviewer: string, actorUserId: string): DdsTopic {
  if (!reviewer.trim() || reviewer.length < 3) throw new Error("Informe quem conferiu o tema (responsável técnico).");
  const catalog = loadDdsTopicCatalog();
  const topic = catalog.topics.find((entry) => entry.id === id);
  if (!topic) throw new Error("Tema não encontrado.");
  topic.status = "active";
  topic.reviewer = reviewer.trim();
  topic.reviewedAt = new Date().toISOString();
  topic.updatedAt = topic.reviewedAt;
  topic.history.push({ action: "activated", actorUserId, occurredAt: topic.reviewedAt });
  writeDdsTopicCatalog(catalog);
  return topic;
}

export function supersedeDdsTopic(id: string, actorUserId: string): DdsTopic {
  const catalog = loadDdsTopicCatalog();
  const topic = catalog.topics.find((entry) => entry.id === id);
  if (!topic) throw new Error("Tema não encontrado.");
  topic.status = "superseded";
  topic.updatedAt = new Date().toISOString();
  topic.history.push({ action: "superseded", actorUserId, occurredAt: topic.updatedAt });
  writeDdsTopicCatalog(catalog);
  return topic;
}
