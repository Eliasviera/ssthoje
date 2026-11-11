import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Biblioteca de vocabulário de campo: listas suspensas para a APR e a AR.
// Três eixos: PERIGOS, CONSEQUÊNCIAS (danos) e MEDIDAS DE CONTROLE.
// O conteúdo nasce do PGR aprovado da empresa-modelo (vocabulário real já usado em campo)
// e pode ser ampliado pelo responsável técnico. Busca por termo em cada eixo.

export type VocabularyKind = "hazard" | "harm" | "control" | "activity" | "stage" | "location" | "condition";

export type VocabularyEntry = {
  id: string;
  kind: VocabularyKind;
  label: string;
  /** Termo em linguagem de campo, para o encarregado reconhecer de imediato. */
  simpleLabel?: string;
  /** Grupo para agrupar na lista (ex.: Químico, Ergonômico, EPI, Administrativo). */
  group: string;
  /** Referência normativa quando houver. */
  reference?: string;
  /** Origem do termo: PGR da empresa, acervo de APR ou inclusão manual. */
  source: "pgr" | "apr_catalog" | "manual";
  uses: number;
};

export type VocabularyLibrary = { entries: VocabularyEntry[] };

const emptyLibrary: VocabularyLibrary = { entries: [] };

export function vocabularyPath() {
  return join(process.cwd(), "data", "field-vocabulary.json");
}

export function loadVocabulary(): VocabularyLibrary {
  try {
    const parsed = JSON.parse(readFileSync(vocabularyPath(), "utf8")) as VocabularyLibrary;
    return Array.isArray(parsed.entries) ? parsed : emptyLibrary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLibrary;
    throw error;
  }
}

function writeVocabulary(library: VocabularyLibrary) {
  const path = vocabularyPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(library, null, 2));
}

/** Lista por eixo, opcionalmente filtrada por termo (busca simples, sem acento). */
export function searchVocabulary(kind: VocabularyKind, term = "", limit = 50): VocabularyEntry[] {
  const normalized = normalize(term);
  const entries = loadVocabulary().entries.filter((entry) => entry.kind === kind);
  const filtered = normalized
    ? entries.filter((entry) => normalize(entry.label).includes(normalized) || normalize(entry.simpleLabel ?? "").includes(normalized) || normalize(entry.group).includes(normalized))
    : entries;
  return filtered.sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label, "pt-BR")).slice(0, limit);
}

export function listVocabularyGroups(kind: VocabularyKind): { group: string; total: number }[] {
  const entries = loadVocabulary().entries.filter((entry) => entry.kind === kind);
  const map = new Map<string, number>();
  for (const entry of entries) map.set(entry.group, (map.get(entry.group) ?? 0) + 1);
  return [...map.entries()].map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
}

export function addVocabularyEntry(input: { kind: VocabularyKind; label: string; group: string; reference?: string; actorUserId: string }): VocabularyEntry {
  const label = input.label.trim();
  if (!label || label.length > 240) throw new Error("Informe o termo (até 240 caracteres).");
  const library = loadVocabulary();
  const exists = library.entries.find((entry) => entry.kind === input.kind && normalize(entry.label) === normalize(label));
  if (exists) return exists;
  const entry: VocabularyEntry = {
    id: `vocab-${input.kind}-${library.entries.length + 1}-${Date.now()}`,
    kind: input.kind,
    label,
    group: input.group.trim() || "Geral",
    reference: input.reference?.trim() || undefined,
    source: "manual",
    uses: 0,
  };
  library.entries.push(entry);
  writeVocabulary(library);
  return entry;
}

export function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
