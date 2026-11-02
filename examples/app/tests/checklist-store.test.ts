import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { archiveTemplate, ChecklistError, completeInspection, createTemplate, listInspections, listTemplates } from "../src/lib/checklist-store.ts";
import { hasTenantPermission } from "../src/lib/tenant-access.ts";

const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString("base64")}`;

function withTempData(run: () => void) {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "checklist-tests-"));
  process.chdir(dir);
  try { run(); } finally { process.chdir(original); rmSync(dir, { recursive: true, force: true }); }
}
const base = (templateId: string, answers: Record<string, { answer: string; note: string }>) => ({ tenantId: "a", templateId, companyId: "c", unitId: "u", subject: "Local", performedOn: "2026-11-02", inspector: "TST", answers, image: png, actorUserId: "u1" });

test("checklist isola consultorias, exige respostas e preserva histórico", () => withTempData(() => {
  const template = createTemplate({ tenantId: "a", kind: "equipment", name: "Modelo", items: ["Item 1", "", "Item 2"], actorUserId: "u1" });
  assert.equal(template.items.length, 2);
  assert.equal(listTemplates("b").length, 0);
  const [one, two] = template.items;
  assert.throws(() => completeInspection(base(template.id, { [one.id]: { answer: "ok", note: "" } })), /Responda/);
  assert.throws(() => completeInspection(base(template.id, { [one.id]: { answer: "nok", note: "" }, [two.id]: { answer: "ok", note: "" } })), /observação/);
  assert.throws(() => completeInspection({ ...base(template.id, { [one.id]: { answer: "ok", note: "" }, [two.id]: { answer: "na", note: "" } }), tenantId: "b" }), ChecklistError);
  completeInspection(base(template.id, { [one.id]: { answer: "nok", note: "Falha" }, [two.id]: { answer: "ok", note: "" } }));
  archiveTemplate("a", template.id);
  assert.equal(listInspections("a").length, 1);
  assert.equal(listInspections("b").length, 0);
  assert.throws(() => completeInspection(base(template.id, { [one.id]: { answer: "ok", note: "" }, [two.id]: { answer: "ok", note: "" } })), /indisponível/);
}));

test("permissões de checklist por perfil", () => {
  assert.ok(hasTenantPermission("campo", "checklist.apply"));
  assert.ok(!hasTenantPermission("campo", "checklist.manage"));
  assert.ok(hasTenantPermission("sst_tst", "checklist.manage"));
  assert.ok(!hasTenantPermission("cliente", "checklist.apply"));
});
