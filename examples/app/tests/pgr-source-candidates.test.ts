import assert from "node:assert/strict";
import test from "node:test";
import { buildPgrSourceCandidates } from "../src/lib/pgr-source-candidates.ts";

test("sugestões guardam página sem inventar pessoas, setor ausente ou associação de risco", () => {
  const result = buildPgrSourceCandidates({ sha256: "fixture", pageCount: 3, pages: [
    { number: 1, status: "text", text: "Caracterização da força de trabalho\nSOLDADOR Função\nPRODUÇÃO Setor\n34 Total" },
    { number: 2, status: "text", text: "Caracterização da força de trabalho\nPINTOR Função\nClassificação dos Riscos\n5 2 - Baixo Tolerável 2 - Marginal 3 - Moderada AGENTE FICTÍCIO\nAção Recomendada:\nAvaliação Quantitativa" },
    { number: 3, status: "failed", text: "SOLDADOR Função" },
  ] });
  assert.deepEqual(result.roles, [{ role: "SOLDADOR", sector: "PRODUÇÃO", page: 1 }, { role: "PINTOR", sector: undefined, page: 2 }]);
  assert.equal(result.riskRows.length, 1);
  assert.equal(result.riskRows[0].page, 2);
  assert.equal("role" in result.riskRows[0], false);
  assert.deepEqual(result.actionPages, [2]);
  assert.deepEqual(result.exposurePages, [2]);
  assert.equal("workers" in result, false);
});
