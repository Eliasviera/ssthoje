import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRiskAnalysis,
  issueRiskAnalysis,
  listRiskAnalyses,
  RiskAnalysisValidationError,
  saveRiskAnalysisDraft,
} from "../src/lib/risk-analysis-store.ts";

const originalDirectory = process.cwd();
let testDirectory = "";

before(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "sst-risk-analysis-tests-"));
  process.chdir(testDirectory);
});

after(() => {
  process.chdir(originalDirectory);
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
});

function createDraft(tenantId = "tenant-a") {
  return createRiskAnalysis({
    tenantId,
    companyId: "company-a",
    unitId: "unit-a",
    title: "Análise de demonstração",
    activity: "Atividade fictícia",
    workArea: "Local fictício",
    assessment: "Avaliação profissional de demonstração",
    controls: "Medidas informadas pelo responsável",
    responsibleName: "Profissional de demonstração",
    createdBy: "user-a",
  });
}

test("mantém AR independente e lista somente registros do tenant solicitado", () => {
  const first = createDraft("tenant-a");
  const second = createDraft("tenant-b");

  assert.equal(first.status, "draft");
  assert.equal(first.revision, 1);
  assert.deepEqual(listRiskAnalyses("tenant-a").map(({ id }) => id), [first.id]);
  assert.deepEqual(listRiskAnalyses("tenant-b").map(({ id }) => id), [second.id]);
  assert.equal("pgrInventoryId" in first, false);
});

test("salva revisões, rejeita atualização desatualizada e preserva isolamento", () => {
  const draft = createDraft();
  const updated = saveRiskAnalysisDraft(
    "tenant-a",
    draft.id,
    draft.revision,
    { ...draft, title: "Título revisado" },
    "user-a",
  );

  assert.equal(updated.revision, 2);
  assert.equal(updated.history.length, 2);
  assert.equal(updated.history[1].action, "saved");
  assert.equal(updated.title, "Título revisado");
  assert.throws(
    () => saveRiskAnalysisDraft("tenant-a", draft.id, draft.revision, draft, "user-a"),
    RiskAnalysisValidationError,
  );
  assert.throws(
    () => saveRiskAnalysisDraft("tenant-b", draft.id, updated.revision, draft, "user-b"),
    /não está disponível/,
  );
});

test("emissão registra revisão e bloqueia alterações posteriores", () => {
  const draft = createDraft();
  const issued = issueRiskAnalysis("tenant-a", draft.id, draft.revision, "user-a");

  assert.equal(issued.status, "issued");
  assert.equal(issued.revision, 2);
  assert.equal(issued.issuedBy, "user-a");
  assert.ok(issued.issuedAt);
  assert.equal(issued.history.at(-1)?.action, "issued");
  assert.throws(
    () => saveRiskAnalysisDraft("tenant-a", draft.id, issued.revision, draft, "user-a"),
    /não está disponível para alteração/,
  );
  assert.throws(
    () => issueRiskAnalysis("tenant-a", draft.id, issued.revision, "user-a"),
    /não está disponível para alteração/,
  );
});

test("não aceita emitir conteúdo incompleto", () => {
  const draft = createDraft();
  assert.throws(
    () => saveRiskAnalysisDraft("tenant-a", draft.id, draft.revision, { ...draft, assessment: "   " }, "user-a"),
    /Preencha todos os campos/,
  );
});
