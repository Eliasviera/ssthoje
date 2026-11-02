import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEsocialMapping,
  EsocialMappingValidationError,
  listEsocialMappings,
  reviewEsocialMapping,
  saveEsocialMappingDraft,
} from "../src/lib/esocial-mapping-store.ts";

const originalDirectory = process.cwd();
let testDirectory = "";

before(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "sst-esocial-mapping-tests-"));
  process.chdir(testDirectory);
});

after(() => {
  process.chdir(originalDirectory);
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
});

function fields(overrides: Partial<Parameters<typeof createEsocialMapping>[0]> = {}) {
  return {
    tenantId: "tenant-a",
    companyId: "company-a",
    unitId: "unit-a",
    tableId: "24" as const,
    code: "01.01.001",
    sourceReference: "PGR fictício · revisão 2 · risco R-1",
    targetDescription: "Agente identificado manualmente no documento de origem",
    rationale: "Associação proposta para conferência profissional",
    createdBy: "sst-user",
    ...overrides,
  };
}

test("associação armazena referência e versão do catálogo sem atravessar tenant", () => {
  const mapping = createEsocialMapping(fields());
  assert.equal(mapping.status, "draft");
  assert.equal(mapping.revision, 1);
  assert.equal(mapping.codeLabel, "Arsênio e seus compostos");
  assert.match(mapping.catalogVersion, /S-1\.3/);
  assert.equal(mapping.history[0].action, "created");
  assert.deepEqual(listEsocialMappings("tenant-a").map(({ id }) => id), [mapping.id]);
  assert.deepEqual(listEsocialMappings("tenant-b"), []);
});

test("valida código pela tabela correspondente e exige referências e fundamentação", () => {
  assert.throws(
    () => createEsocialMapping(fields({ code: "0001" })),
    EsocialMappingValidationError,
  );
  assert.throws(
    () => createEsocialMapping(fields({ tableId: "27", code: "01.01.001" })),
    EsocialMappingValidationError,
  );
  assert.throws(
    () => createEsocialMapping(fields({ rationale: " " })),
    /Preencha a origem/,
  );
});

test("rascunhos são versionados, exigem revisão atual e congelam quando revisados", () => {
  const mapping = createEsocialMapping(fields());
  const saved = saveEsocialMappingDraft(
    "tenant-a",
    mapping.id,
    mapping.revision,
    { ...mapping, rationale: "Fundamentação atualizada após conferência" },
    "sst-user",
  );
  assert.equal(saved.revision, 2);
  assert.equal(saved.history.length, 2);
  assert.equal(saved.history[1].action, "saved");
  assert.throws(
    () => saveEsocialMappingDraft("tenant-a", mapping.id, mapping.revision, mapping, "sst-user"),
    /mudou em outra sessão/,
  );

  const reviewed = reviewEsocialMapping("tenant-a", mapping.id, saved.revision, "sst-reviewer", "Código e origem conferidos manualmente.");
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.revision, 3);
  assert.equal(reviewed.reviewedBy, "sst-reviewer");
  assert.equal(reviewed.history.at(-1)?.action, "reviewed");
  assert.throws(
    () => saveEsocialMappingDraft("tenant-a", mapping.id, reviewed.revision, mapping, "sst-user"),
    /imutável/,
  );
  assert.throws(
    () => reviewEsocialMapping("tenant-a", mapping.id, reviewed.revision, "sst-reviewer", "Revisão repetida"),
    /Somente uma associação/,
  );
});

test("nova versão preserva a revisão anterior e rejeita parent fora do tenant ou desatualizado", () => {
  const original = createEsocialMapping(fields());
  const reviewed = reviewEsocialMapping("tenant-a", original.id, original.revision, "sst-reviewer", "Referência conferida.");
  const next = createEsocialMapping(fields({
    code: "01.02.001",
    createdBy: "sst-user",
    supersedesMappingId: reviewed.id,
    supersedesRevision: reviewed.revision,
  }));
  assert.equal(next.revision, reviewed.revision + 1);
  assert.equal(next.supersedesMappingId, reviewed.id);
  assert.equal(next.supersedesRevision, reviewed.revision);
  assert.equal(listEsocialMappings("tenant-a").find(({ id }) => id === reviewed.id)?.status, "reviewed");
  assert.throws(
    () => createEsocialMapping(fields({ tenantId: "tenant-b", supersedesMappingId: reviewed.id, supersedesRevision: reviewed.revision })),
    /não está disponível/,
  );
  assert.throws(
    () => createEsocialMapping(fields({ supersedesMappingId: reviewed.id, supersedesRevision: 1 })),
    /mudou/,
  );
});

test("Tabela 27 mantém procedimento e versão próprios sem misturar com Tabela 24", () => {
  const table24Before = listEsocialMappings("tenant-a").filter(({ tableId }) => tableId === "24").length;
  const medical = createEsocialMapping(fields({
    tableId: "27",
    code: "9999",
    sourceReference: "PCMSO fictício · versão 4",
    targetDescription: "Procedimento diagnóstico definido pelo médico",
    rationale: "Justificativa médica para revisão",
    createdBy: "medical-user",
  }));
  assert.equal(medical.codeLabel, "Outros procedimentos diagnósticos não descritos anteriormente");
  const mappings = listEsocialMappings("tenant-a");
  assert.equal(mappings.some(({ id, tableId }) => id === medical.id && tableId === "24"), false);
  assert.equal(mappings.find(({ id }) => id === medical.id)?.tableId, "27");
  assert.equal(mappings.filter(({ tableId }) => tableId === "24").length, table24Before);
});
