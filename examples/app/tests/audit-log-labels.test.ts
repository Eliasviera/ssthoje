import assert from "node:assert/strict";
import test from "node:test";
import { getSafetyAuditActionLabel } from "../src/lib/safety-audit-labels.ts";

test("descreve eventos de rascunho e ativação de modelos APR", () => {
  assert.equal(getSafetyAuditActionLabel("safety.checklist_draft_created"), "Rascunho de modelo de APR criado");
  assert.equal(getSafetyAuditActionLabel("safety.checklist_activated"), "Modelo de checklist ativado para APR");
  assert.equal(getSafetyAuditActionLabel("safety.apr_created"), "APR criada como rascunho");
  assert.equal(getSafetyAuditActionLabel("safety.apr_saved"), "Respostas da APR salvas");
  assert.equal(getSafetyAuditActionLabel("safety.apr_submitted"), "APR enviada para revisão humana");
  assert.equal(getSafetyAuditActionLabel("safety.work_permit_draft_saved"), "Rascunho demonstrativo de PT/PTE salvo");
  assert.equal(getSafetyAuditActionLabel("other.action"), undefined);
});
