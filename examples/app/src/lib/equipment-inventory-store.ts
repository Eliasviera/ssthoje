import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

// Inventário de equipamentos da empresa: é a ponte entre o acervo de checklists (genérico)
// e as inspeções (que passam a referenciar o equipamento), permitindo indicativos como
// "equipamento X não inspecionado no mês".

export type EquipmentSituation = "ativo" | "manutencao" | "baixado";

export type EquipmentRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  code: string;          // patrimônio/código interno (ex.: P-02)
  name: string;          // ex.: Prensa hidráulica 60t
  brandModel?: string;
  serialNumber?: string;
  location?: string;
  sector?: string;
  situation: EquipmentSituation;
  // ligação ao modelo de checklist do acervo
  checklistTemplateId?: string;
  requiredFrequency?: "antes_uso" | "diario" | "semanal" | "mensal";
  createdAt: string;
  updatedAt: string;
};

export type EquipmentInventory = { equipment: EquipmentRecord[] };

const emptyInventory: EquipmentInventory = { equipment: [] };

function inventoryPath() {
  return join(process.cwd(), "data", "equipment-inventory.json");
}

function readInventory(): EquipmentInventory {
  try {
    const parsed = JSON.parse(readFileSync(inventoryPath(), "utf8")) as EquipmentInventory;
    return Array.isArray(parsed.equipment) ? parsed : emptyInventory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyInventory;
    throw error;
  }
}

function writeInventory(inventory: EquipmentInventory) {
  const path = inventoryPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(inventory, null, 2));
}

export function listEquipment(tenantId: string, companyId?: string, unitId?: string): EquipmentRecord[] {
  return readInventory().equipment.filter((entry) => entry.tenantId === tenantId
    && (!companyId || entry.companyId === companyId)
    && (!unitId || entry.unitId === unitId));
}

export function createEquipment(input: {
  tenantId: string; companyId: string; unitId: string; code: string; name: string;
  brandModel?: string; serialNumber?: string; location?: string; sector?: string;
  situation?: EquipmentSituation; checklistTemplateId?: string; requiredFrequency?: EquipmentRecord["requiredFrequency"];
  actorUserId: string;
}): EquipmentRecord {
  if (!input.code.trim() || !input.name.trim()) throw new Error("Informe código e nome do equipamento.");
  const inventory = readInventory();
  if (inventory.equipment.some((entry) => entry.tenantId === input.tenantId && entry.code.trim().toLowerCase() === input.code.trim().toLowerCase())) {
    throw new Error(`Já existe um equipamento com o código ${input.code.trim()}.`);
  }
  const now = new Date().toISOString();
  const record: EquipmentRecord = {
    id: `equipment-${randomUUID()}`,
    tenantId: input.tenantId, companyId: input.companyId, unitId: input.unitId,
    code: input.code.trim(), name: input.name.trim(),
    brandModel: input.brandModel?.trim() || undefined,
    serialNumber: input.serialNumber?.trim() || undefined,
    location: input.location?.trim() || undefined,
    sector: input.sector?.trim() || undefined,
    situation: input.situation ?? "ativo",
    checklistTemplateId: input.checklistTemplateId,
    requiredFrequency: input.requiredFrequency,
    createdAt: now, updatedAt: now,
  };
  inventory.equipment.push(record);
  writeInventory(inventory);
  return record;
}

export function updateEquipmentSituation(id: string, tenantId: string, situation: EquipmentSituation, actorUserId: string): EquipmentRecord {
  const inventory = readInventory();
  const record = inventory.equipment.find((entry) => entry.id === id && entry.tenantId === tenantId);
  if (!record) throw new Error("Equipamento não encontrado.");
  record.situation = situation;
  record.updatedAt = new Date().toISOString();
  writeInventory(inventory);
  return record;
}
