import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

// Acervo de checklists de equipamentos — mesma arquitetura do catálogo de DDS:
// catálogo JSON, rascunho → ativo com conferência do PLH (reviewer + data).
// Os itens são baseados em normas (NR-12 máquinas, NR-11 transporte) e
// conferidos pelo responsável técnico antes de valerem.

export type ChecklistFrequency = "antes_uso" | "diario" | "semanal" | "por_turno";

export type EquipmentChecklistItem = {
  id: string;
  prompt: string;
  frequency: ChecklistFrequency;
  critical: boolean;
  reference: string;
};

export type EquipmentChecklist = {
  id: string;
  equipment: string;
  equipmentGroup: string;
  nr: string;
  summary: string;
  items: EquipmentChecklistItem[];
  status: "draft" | "active" | "superseded";
  reviewer: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
  history: { action: "created" | "activated" | "superseded" | "updated"; actorUserId: string; occurredAt: string }[];
};

export type EquipmentChecklistCatalog = { checklists: EquipmentChecklist[] };

const emptyCatalog: EquipmentChecklistCatalog = { checklists: [] };

export function equipmentCatalogPath() {
  return join(process.cwd(), "data", "equipment-checklists.json");
}

export function loadEquipmentChecklistCatalog(): EquipmentChecklistCatalog {
  try {
    const parsed = JSON.parse(readFileSync(equipmentCatalogPath(), "utf8")) as EquipmentChecklistCatalog;
    return Array.isArray(parsed.checklists) ? parsed : emptyCatalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCatalog;
    throw error;
  }
}

function writeEquipmentChecklistCatalog(catalog: EquipmentChecklistCatalog) {
  const path = equipmentCatalogPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(catalog, null, 2));
}

export function listEquipmentChecklists(status?: EquipmentChecklist["status"]): EquipmentChecklist[] {
  const checklists = loadEquipmentChecklistCatalog().checklists;
  return status ? checklists.filter((entry) => entry.status === status) : checklists;
}

export function listActiveEquipmentChecklists(): EquipmentChecklist[] {
  return loadEquipmentChecklistCatalog().checklists.filter((entry) => entry.status === "active");
}

export function createEquipmentChecklist(input: {
  equipment: string;
  equipmentGroup: string;
  nr: string;
  summary: string;
  items: Omit<EquipmentChecklistItem, "id">[];
  actorUserId: string;
}): EquipmentChecklist {
  if (!input.equipment.trim() || input.equipment.length > 160) throw new Error("Nome do equipamento obrigatório (até 160 caracteres).");
  if (!input.nr.trim() || input.nr.length > 40) throw new Error("Informe a NR de referência (ex.: NR-12).");
  if (!input.summary.trim() || input.summary.length > 300) throw new Error("Resumo obrigatório (até 300 caracteres).");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 60) {
    throw new Error("O checklist precisa ter de 1 a 60 itens.");
  }
  const now = new Date().toISOString();
  const checklist: EquipmentChecklist = {
    id: `equipment-checklist-${randomUUID()}`,
    equipment: input.equipment.trim(),
    equipmentGroup: input.equipmentGroup.trim() || "Geral",
    nr: input.nr.trim(),
    summary: input.summary.trim(),
    items: input.items.map((item) => ({
      id: `item-${randomUUID()}`,
      prompt: item.prompt.trim(),
      frequency: item.frequency,
      critical: Boolean(item.critical),
      reference: item.reference.trim(),
    })),
    status: "draft",
    reviewer: "",
    reviewedAt: "",
    createdAt: now,
    updatedAt: now,
    history: [{ action: "created", actorUserId: input.actorUserId, occurredAt: now }],
  };
  const catalog = loadEquipmentChecklistCatalog();
  catalog.checklists.push(checklist);
  writeEquipmentChecklistCatalog(catalog);
  return checklist;
}

export function activateEquipmentChecklist(id: string, reviewer: string, actorUserId: string): EquipmentChecklist {
  if (!reviewer.trim() || reviewer.length < 3) throw new Error("Informe quem conferiu o checklist (responsável técnico).");
  const catalog = loadEquipmentChecklistCatalog();
  const checklist = catalog.checklists.find((entry) => entry.id === id);
  if (!checklist) throw new Error("Checklist não encontrado.");
  checklist.status = "active";
  checklist.reviewer = reviewer.trim();
  checklist.reviewedAt = new Date().toISOString();
  checklist.updatedAt = checklist.reviewedAt;
  checklist.history.push({ action: "activated", actorUserId, occurredAt: checklist.reviewedAt });
  writeEquipmentChecklistCatalog(catalog);
  return checklist;
}

export function supersedeEquipmentChecklist(id: string, actorUserId: string): EquipmentChecklist {
  const catalog = loadEquipmentChecklistCatalog();
  const checklist = catalog.checklists.find((entry) => entry.id === id);
  if (!checklist) throw new Error("Checklist não encontrado.");
  checklist.status = "superseded";
  checklist.updatedAt = new Date().toISOString();
  checklist.history.push({ action: "superseded", actorUserId, occurredAt: checklist.updatedAt });
  writeEquipmentChecklistCatalog(catalog);
  return checklist;
}
