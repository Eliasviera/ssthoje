import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSignatureImage, type DdsSignature } from "./dds-store.ts";

export class ChecklistError extends Error {}

export type ChecklistKind = "area" | "equipment";
export type ChecklistAnswer = "ok" | "nok" | "na";
export type ChecklistTemplate = {
  id: string;
  tenantId: string;
  kind: ChecklistKind;
  name: string;
  items: { id: string; text: string; critical?: boolean }[];
  status: "active" | "archived";
  createdByUserId: string;
  createdAt: string;
};
export type ChecklistInspection = {
  id: string;
  tenantId: string;
  templateId: string;
  templateName: string;
  kind: ChecklistKind;
  companyId: string;
  unitId: string;
  subject: string;
  equipmentId?: string;
  performedOn: string;
  inspector: string;
  results: { itemId: string; text: string; answer: ChecklistAnswer; note: string }[];
  freeNotes: { label: string; text: string }[];
  signature: DdsSignature;
  createdByUserId: string;
  createdAt: string;
};
type Store = { templates: ChecklistTemplate[]; inspections: ChecklistInspection[] };

function storePath() {
  return join(process.cwd(), "data", "checklists.json");
}

function readStore(): Store {
  try {
    const value = JSON.parse(readFileSync(storePath(), "utf8")) as Store;
    if (!Array.isArray(value.templates) || !Array.isArray(value.inspections)) throw new ChecklistError("O arquivo local de checklists tem formato inválido.");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { templates: [], inspections: [] };
    throw error;
  }
}

function writeStore(store: Store) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function text(value: unknown, label: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new ChecklistError(`Confira o campo ${label}.`);
  return result;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function listTemplates(tenantId: string): ChecklistTemplate[] {
  return readStore().templates.filter((item) => item.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listInspections(tenantId: string): ChecklistInspection[] {
  return readStore().inspections.filter((item) => item.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createTemplate(input: { tenantId: string; kind: ChecklistKind; name: string; items: (string | { text: string; critical?: boolean })[]; actorUserId: string }): ChecklistTemplate {
  if (input.kind !== "area" && input.kind !== "equipment") throw new ChecklistError("Escolha área ou equipamento.");
  const items = input.items.map((item) => typeof item === "string" ? { text: item.trim(), critical: false } : { text: item.text.trim(), critical: Boolean(item.critical) }).filter((item) => item.text);
  if (items.length < 1 || items.length > 100) throw new ChecklistError("Informe de 1 a 100 itens.");
  const template: ChecklistTemplate = {
    id: randomUUID(), tenantId: input.tenantId, kind: input.kind, name: text(input.name, "nome", 120),
    items: items.map((item) => ({ id: randomUUID(), text: text(item.text, "item", 300), critical: item.critical })),
    status: "active", createdByUserId: input.actorUserId, createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.templates.push(template);
  writeStore(store);
  return template;
}

export function addTemplateItem(input: { tenantId: string; templateId: string; text: string; critical: boolean; actorUserId: string }): ChecklistTemplate {
  const store = readStore();
  const template = store.templates.find((item) => item.id === input.templateId && item.tenantId === input.tenantId);
  if (!template || template.status !== "active") throw new ChecklistError("Modelo indisponível.");
  if (template.items.length >= 100) throw new ChecklistError("Limite de 100 itens por modelo.");
  const textValue = typeof input.text === "string" ? input.text.trim() : "";
  if (!textValue) throw new ChecklistError("Informe o texto do item.");
  template.items.push({ id: randomUUID(), text: textValue.slice(0, 300), critical: Boolean(input.critical) });
  writeStore(store);
  return template;
}

export function archiveTemplate(tenantId: string, id: string): ChecklistTemplate {
  const store = readStore();
  const template = store.templates.find((item) => item.id === id && item.tenantId === tenantId);
  if (!template) throw new ChecklistError("Modelo indisponível.");
  template.status = "archived";
  writeStore(store);
  return { ...template };
}

export function completeInspection(input: {
  tenantId: string; templateId: string; companyId: string; unitId: string; subject: string; performedOn: string; inspector: string;
  answers: Record<string, { answer: string; note: string }>; freeNotes?: { label: string; text: string }[]; equipmentId?: string; image: string; actorUserId: string;
}): ChecklistInspection {
  const store = readStore();
  const template = store.templates.find((item) => item.id === input.templateId && item.tenantId === input.tenantId);
  if (!template || template.status !== "active") throw new ChecklistError("Modelo indisponível.");
  const performedOn = typeof input.performedOn === "string" ? input.performedOn.trim() : "";
  if (!validDate(performedOn)) throw new ChecklistError("Informe uma data válida.");
  const results = template.items.map((item) => {
    const given = input.answers[item.id];
    if (!given || !["ok", "nok", "na"].includes(given.answer)) throw new ChecklistError("Responda todos os itens.");
    const note = typeof given.note === "string" ? given.note.trim().slice(0, 500) : "";
    if (given.answer === "nok" && !note) throw new ChecklistError("Descreva a observação dos itens não conformes.");
    return { itemId: item.id, text: item.text, answer: given.answer as ChecklistAnswer, note };
  });
  const criticalFails = results.filter((result) => {
    const item = template.items.find((entry) => entry.id === result.itemId);
    return item?.critical && result.answer === "nok";
  });
  if (criticalFails.length > 0) {
    throw new ChecklistError(`Item(is) crítico(s) reprovado(s): ${criticalFails.map((result) => result.text).join("; ")}. O equipamento deve ser retirado de uso até a correção.`);
  }
  const now = new Date().toISOString();
  const inspection: ChecklistInspection = {
    id: randomUUID(), tenantId: input.tenantId, templateId: template.id, templateName: template.name, kind: template.kind,
    companyId: input.companyId, unitId: input.unitId, subject: text(input.subject, "área ou equipamento", 160), equipmentId: input.equipmentId?.trim() || undefined, performedOn,
    inspector: text(input.inspector, "responsável pela inspeção", 120), results,
    freeNotes: (input.freeNotes ?? []).slice(0, 2).map((entry) => ({ label: text(entry.label, "rótulo", 80), text: text(entry.text, "observação", 500) })).filter((entry) => entry.label || entry.text),
    signature: { image: validateSignatureImage(input.image), signedAt: now, capturedByUserId: input.actorUserId, method: "drawn_on_screen_simple" },
    createdByUserId: input.actorUserId, createdAt: now,
  };
  store.inspections.push(inspection);
  writeStore(store);
  return inspection;
}
