import assert from "node:assert/strict";
import test from "node:test";
import { getSafetyChecklistSuggestion } from "../src/lib/safety-checklist-suggestions.ts";

test("sugere estrutura organizacional editável sem pré-carregar critérios técnicos", () => {
  const general = getSafetyChecklistSuggestion("general_activity");
  const confined = getSafetyChecklistSuggestion("confined_space_nr33");

  assert.match(general.title, /atividade diversa/);
  assert.equal(general.prompts.length, 5);
  assert.ok(general.prompts.some((prompt) => prompt.includes("PGR aprovado")));
  assert.ok(general.prompts.every((prompt) => prompt.endsWith("?")));

  assert.match(confined.title, /espaço confinado/);
  assert.match(confined.activity, /NR-33 a validar/);
  assert.equal(confined.prompts.length, 5);
  assert.ok(confined.prompts.some((prompt) => prompt.includes("delimitação do espaço")));
  assert.ok(confined.prompts.every((prompt) => prompt.endsWith("?")));

  general.prompts.push("alteração local");
  assert.equal(getSafetyChecklistSuggestion("general_activity").prompts.length, 5);
});
