import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { readContractorAnnexHistory, saveContractorAnnex, currentContractorAnnexes } from "../src/lib/pgr-contractor-annex-store.ts";
test("store de anexos preserva versões, isolamento, conflitos e arquivo após término", () => {
  const original = process.cwd();
  const temporary = mkdtempSync(join(original, ".annex-test-"));
  process.chdir(temporary);
  try {
    const scope = { tenantId: "tenant-test", companyId: "company-test", unitId: "unit-test", sha256: "a".repeat(64) };
    const fields = { title: "Anexo fictício", contractor: "Contratada fictícia", activity: "Atividade sintética", location: "Área fictícia", startsOn: "2026-01-01", risks: "Risco sintético", interference: "Interferência sintética", controls: "Medida sintética", actionPlan: "Ação sintética", evidence: "Evidência sintética", legalReferral: "", contractorType: "me", participants: "with_workers", coverage: "not_covered" };
    const base = { scope, expectedRevision: 0, operation: "save", fields, actorUserId: "actor-test", reason: "Fixture sintética" };
    const created = saveContractorAnnex(base);
    for (const key of ["tenantId", "companyId", "unitId", "sha256"]) {
      const foreign = { ...scope, [key]: key === "sha256" ? "b".repeat(64) : "foreign" };
      assert.deepEqual(readContractorAnnexHistory(foreign), []);
      assert.throws(() => saveContractorAnnex({ ...base, scope: foreign, id: created.id, expectedRevision: 1 }), /indisponível/);
    }
    const included = saveContractorAnnex({ ...base, id: created.id, expectedRevision: 1, operation: "include", confirmed: true });
    const target = join(temporary, "data", "pgr-contractor-annexes", scope.tenantId, scope.companyId, scope.unitId, `${scope.sha256}.jsonl`);
    const before = readFileSync(target, "utf8");
    assert.throws(() => saveContractorAnnex({ ...base, id: created.id, expectedRevision: 1 }), /mudou/);
    assert.equal(readFileSync(target, "utf8"), before);
    writeFileSync(`${target}.lock`, "fixture", "utf8");
    assert.throws(() => saveContractorAnnex({ ...base, id: created.id, expectedRevision: 2 }), /andamento/);
    unlinkSync(`${target}.lock`);
    const closed = saveContractorAnnex({ ...base, id: included.id, expectedRevision: 2, operation: "close", confirmed: true, endedOn: "2026-01-02", remainingActions: "Pendência fictícia mantida" });
    const history = readContractorAnnexHistory(scope);
    assert.deepEqual(history.map(item => item.status), ["draft", "included", "closed"]);
    assert.ok(readFileSync(target, "utf8").startsWith(before));
    assert.deepEqual(currentContractorAnnexes(history), [closed]);
    assert.throws(() => saveContractorAnnex({ ...base, id: closed.id, expectedRevision: 3 }), /somente leitura/);
    assert.throws(() => readContractorAnnexHistory({ ...scope, tenantId: "../foreign" }), /Escopo/);
  } finally {
    process.chdir(original);
    assert.ok(resolve(temporary).startsWith(`${resolve(original)}${process.platform === "win32" ? "\\" : "/"}.annex-test-`));
    rmSync(temporary, { recursive: true, force: true });
  }
});
