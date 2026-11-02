import snapshot from "./esocial-tables-s13-nt07-2026.json" with { type: "json" };

export type EsocialTableId = "24" | "27";

export const ESOCIAL_CATALOG_SNAPSHOT = snapshot;

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

export function searchEsocialCodes(tableId: EsocialTableId, query: string) {
  const table = ESOCIAL_CATALOG_SNAPSHOT.tables.find((entry) => entry.table === tableId);
  if (!table) throw new Error("Tabela eSocial indisponível neste snapshot.");
  const search = normalizeSearch(query);
  if (!search) return table.entries;
  return table.entries.filter((entry) =>
    normalizeSearch(entry.code).includes(search) || normalizeSearch(entry.label).includes(search),
  );
}

export function getEsocialCode(tableId: EsocialTableId, code: string) {
  const table = ESOCIAL_CATALOG_SNAPSHOT.tables.find((entry) => entry.table === tableId);
  if (!table) throw new Error("Tabela eSocial indisponível neste snapshot.");
  return table.entries.find((entry) => entry.code === code);
}
