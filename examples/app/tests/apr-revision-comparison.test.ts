import assert from "node:assert/strict";
import test from "node:test";
import { compareAprRevisions } from "../src/lib/apr-revision-comparison.ts";
import type { SafetyAprRevision } from "../src/lib/safety-operations-store.ts";
function revision(number: number): SafetyAprRevision {
  return { revision: number, status: "draft", action: "saved", occurredAt: "2026-10-25T12:00:00Z", actorUserId: "conta-ficticia",
    answers: [{ id: "item-a", prompt: "Pergunta sintética", result: "unanswered", notes: "", nextStep: "", responsible: "" }] };
}
test("compara resultado, observação, ação e responsável sem alterar os registros", () => {
  const before = revision(1), after = revision(2);
  Object.assign(after.answers[0], { result: "attention", notes: "Observação sintética", nextStep: "Ação sintética", responsible: "Pessoa fictícia" });
  const original = structuredClone([before, after]);
  const result = compareAprRevisions(before, after);
  assert.ok(result.available);
  assert.deepEqual(result.items[0].changes.map(change => change.field), ["result", "notes", "nextStep", "responsible"]);
  assert.equal(result.items[0].changes[0].before, "unanswered");
  assert.equal(result.items[0].changes[0].after, "attention");
  assert.deepEqual([before, after], original);
});
test("envio com respostas iguais distingue mudança de estado de mudança nas respostas", () => {
  const before = revision(2), after = revision(3);
  after.status = "in_review";
  after.action = "submitted";
  const result = compareAprRevisions(before, after);
  assert.ok(result.available);
  assert.equal(result.statusChanged, true);
  assert.deepEqual(result.items, []);
});
test("alinha por ID, sem associar perguntas diferentes pelo texto ou pela posição", () => {
  const before = revision(1), after = revision(2);
  before.answers.push({ ...before.answers[0], id: "item-b" });
  after.answers = [...before.answers].reverse().map(answer => ({ ...answer }));
  let result = compareAprRevisions(before, after);
  assert.ok(result.available);
  assert.equal(result.items.length, 0);
  after.answers[0].id = "item-c";
  result = compareAprRevisions(before, after);
  assert.ok(result.available);
  assert.deepEqual(result.items.map(item => [item.id, item.kind]), [["item-b", "removed"], ["item-c", "added"]]);
  assert.equal(result.items[0].changes[0].after, null);
});
test("não combina IDs duplicados e não aceita comparação invertida", () => {
  const before = revision(1), after = revision(2);
  after.answers.push({ ...after.answers[0] });
  assert.equal(compareAprRevisions(before, after).available, false);
  assert.equal(compareAprRevisions(revision(3), revision(2)).available, false);
  assert.equal(compareAprRevisions(revision(2), revision(2)).available, false);
});
test("histórico parcial compara somente revisões disponíveis e preserva ausência de autoria", () => {
  const before = revision(7), after = revision(10);
  before.action = "legacy_snapshot";
  delete before.actorUserId;
  after.answers[0].prompt = "Texto revisado pela equipe fictícia";
  const result = compareAprRevisions(before, after);
  assert.ok(result.available);
  assert.equal(result.fromRevision, 7);
  assert.equal(result.toRevision, 10);
  assert.deepEqual(result.items[0].changes.map(change => change.field), ["prompt"]);
  assert.equal(before.actorUserId, undefined);
});
