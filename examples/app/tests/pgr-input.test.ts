import assert from "node:assert/strict";
import test from "node:test";
import { parsePgrForm } from "../src/lib/pgr-input.ts";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: "PGR fictício",
    companyUnit: "company-id|unit-id",
    activityDescription: "Atividade observada.",
    riskInventory: "Outro: relato a validar.",
    actionPlan: "Ação a definir.",
    ...overrides,
  })) data.set(key, value);
  return data;
}

test("PGR valida o formulário sem truncar o relato de riscos", () => {
  const riskInventory = `Outro: ${"relato fictício ".repeat(200)}`;
  const parsed = parsePgrForm(form({ riskInventory }));
  assert.ok("value" in parsed);
  if ("value" in parsed) assert.equal(parsed.value.riskInventory, riskInventory.trim());
});

test("PGR rejeita campos acima do limite e vínculos ambíguos", () => {
  const tooLong = parsePgrForm(form({ riskInventory: "x".repeat(5001) }));
  assert.ok("error" in tooLong);
  if ("error" in tooLong) assert.match(tooLong.error, /limite/);
  const invalidLink = parsePgrForm(form({ companyUnit: "company-id|unit-id|extra" }));
  assert.ok("error" in invalidLink);
});

test("PGR exige os campos informados obrigatórios", () => {
  const parsed = parsePgrForm(form({ actionPlan: "   " }));
  assert.ok("error" in parsed);
});

test("PGR exige revisão esperada ao editar um rascunho existente", () => {
  const missingRevision = parsePgrForm(form({ draftId: "draft-id" }));
  assert.ok("error" in missingRevision);
  const validRevision = parsePgrForm(form({ draftId: "draft-id", expectedRevision: "2" }));
  assert.ok("value" in validRevision);
  if ("value" in validRevision) assert.equal(validRevision.value.expectedRevision, 2);
});
