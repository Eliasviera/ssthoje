import assert from "node:assert/strict";
import test from "node:test";
import { ESOCIAL_CATALOG_SNAPSHOT, searchEsocialCodes } from "../src/lib/esocial-catalog.ts";

test("snapshot oficial identifica origem, versão, data de captura e não habilita transmissão", () => {
  assert.equal(ESOCIAL_CATALOG_SNAPSHOT.jurisdiction, "Brasil");
  assert.equal(ESOCIAL_CATALOG_SNAPSHOT.sourceVersion, "eSocial S-1.3, consolidada até NT 07/2026");
  assert.equal(ESOCIAL_CATALOG_SNAPSHOT.sourceRevisionDate, "2026-10-20");
  assert.equal(ESOCIAL_CATALOG_SNAPSHOT.retrievedAt, "2026-11-01");
  assert.match(ESOCIAL_CATALOG_SNAPSHOT.sourceUrl, /^https:\/\/www\.gov\.br\/esocial\//);
  assert.match(ESOCIAL_CATALOG_SNAPSHOT.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(ESOCIAL_CATALOG_SNAPSHOT.transmissionEnabled, false);
});

test("Tabela 24 contém códigos no formato oficial e é distinta da Tabela 27", () => {
  const table24 = ESOCIAL_CATALOG_SNAPSHOT.tables.find((table) => table.table === "24");
  const table27 = ESOCIAL_CATALOG_SNAPSHOT.tables.find((table) => table.table === "27");
  assert.ok(table24);
  assert.ok(table27);
  assert.equal(table24.event, "S-2240");
  assert.equal(table27.event, "S-2220");
  assert.equal(table24.entries.length, 92);
  assert.equal(table27.entries.length, 1450);
  assert.ok(table24.entries.every((entry) => /^\d{2}\.\d{2}\.\d{3}$/.test(entry.code) && entry.label.trim()));
  assert.ok(table27.entries.every((entry) => /^\d{4}$/.test(entry.code) && entry.label.trim()));
  assert.equal(new Set(table24.entries.map((entry) => entry.code)).size, table24.entries.length);
  assert.equal(new Set(table27.entries.map((entry) => entry.code)).size, table27.entries.length);
});

test("pesquisa não mistura agentes e procedimentos e ignora acentos na descrição", () => {
  assert.deepEqual(searchEsocialCodes("24", "01.01.001").map(({ code }) => code), ["01.01.001"]);
  assert.deepEqual(searchEsocialCodes("24", "arsenio").map(({ code }) => code), ["01.01.001"]);
  assert.deepEqual(searchEsocialCodes("27", "01.01.001"), []);
  assert.deepEqual(searchEsocialCodes("27", "9999").map(({ code }) => code), ["9999"]);
});
