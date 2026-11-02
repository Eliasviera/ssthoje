import type { WorkPermitDraftRevisionsPair } from "./work-permit-draft-store";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "./work-permit-source-field-maps";

export function compareWorkPermitDraftRevisions(pair: WorkPermitDraftRevisionsPair) {
  const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === pair.mapId);
  const [older, newer] = pair.left.revision < pair.right.revision
    ? [pair.left, pair.right] : [pair.right, pair.left];
  const changes: Array<{ key: string; section: string; label: string; before: string; after: string }> = [];
  function add(key: string, section: string, label: string, before = "", after = "") {
    if (before !== after) changes.push({ key, section, label, before, after });
  }
  add("title", "Identificação do rascunho", "Título", older.title, newer.title);
  add("aprId", "Identificação do rascunho", "Referência da APR (identificador)", older.aprId, newer.aprId);
  const labels = new Map<string, { section: string; label: string }>(source?.sections.flatMap((section) => section.fields.map((field) =>
    [`${section.id}.${field.id}`, { section: section.title, label: field.label }] as const)));
  for (const key of new Set([...labels.keys(), ...Object.keys(older.values), ...Object.keys(newer.values)])) {
    const label = labels.get(key) ?? { section: "Campo histórico sem rótulo no mapa atual", label: key };
    add(`value:${key}`, label.section, label.label, older.values[key], newer.values[key]);
  }
  return { older, newer, changes };
}
