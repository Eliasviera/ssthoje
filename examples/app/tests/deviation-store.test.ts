import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDeviation, DeviationError, listDeviations, transitionDeviation } from "../src/lib/deviation-store.ts";
import { hasTenantPermission, type TenantRole } from "../src/lib/tenant-access.ts";

function withTempData(run: () => void) {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "deviation-tests-"));
  process.chdir(dir);
  try { run(); } finally { process.chdir(original); rmSync(dir, { recursive: true, force: true }); }
}
const input = (over: Record<string, string> = {}) => ({ tenantId: "a", kind: "near_miss", companyId: "", unitId: "", occurredOn: "2026-11-02", location: "Pátio", description: "Material caiu perto do corredor", immediateAction: "", reporterName: "Fulano", actorUserId: "u1", ...over });

test("desvio: valida, isola tenant e limita visão de quem só relata", () => withTempData(() => {
  assert.throws(() => createDeviation(input({ kind: "outro" })), DeviationError);
  assert.throws(() => createDeviation(input({ occurredOn: "2026-02-31" })), /data/);
  assert.throws(() => createDeviation(input({ description: " " })), DeviationError);
  const mine = createDeviation(input());
  createDeviation(input({ actorUserId: "u2" }));
  createDeviation(input({ tenantId: "b", actorUserId: "u3" }));
  assert.equal(listDeviations("a", { userId: "u1", canManage: false }).length, 1);
  assert.equal(listDeviations("a", { userId: "u1", canManage: true }).length, 2);
  assert.equal(listDeviations("b", { userId: "u1", canManage: false }).length, 0);
  assert.throws(() => transitionDeviation({ tenantId: "b", id: mine.id, status: "closed", note: "x", actorUserId: "m" }), /indisponível/);
  assert.throws(() => transitionDeviation({ tenantId: "a", id: mine.id, status: "closed", note: "", actorUserId: "m" }), /tratativa/);
  transitionDeviation({ tenantId: "a", id: mine.id, status: "in_review", note: "", actorUserId: "m" });
  const closed = transitionDeviation({ tenantId: "a", id: mine.id, status: "closed", note: "Corrigido", actorUserId: "m" });
  assert.equal(closed.history.length, 3);
  assert.throws(() => transitionDeviation({ tenantId: "a", id: mine.id, status: "in_review", note: "", actorUserId: "m" }), /encerrado/);
}));

test("todos os papéis de consultoria podem relatar; só admin e TST tratam", () => {
  for (const role of ["consultoria_admin", "sst_tst", "cliente", "terceiro", "profissional_habilitado", "medico_coordenador", "campo"] as TenantRole[]) {
    assert.equal(hasTenantPermission(role, "deviation.report"), true, role);
  }
  assert.equal(hasTenantPermission("campo", "deviation.manage"), false);
  assert.equal(hasTenantPermission("cliente", "deviation.manage"), false);
  assert.equal(hasTenantPermission("sst_tst", "deviation.manage"), true);
});
