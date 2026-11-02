import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPgrDraftsForTenant, savePgrDraft, transitionPgrDraft } from "../src/lib/pgr-store.ts";

test("PGR preserva relatos, revisões e isolamento entre consultorias", () => {
  const originalCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "sst-pgr-store-"));
  process.chdir(root);

  try {
    const actor = { userId: "sst-demo-user", role: "consultoria_admin" as const };
    const input = {
      companyId: "company-fictional",
      unitId: "unit-fictional",
      title: "Rascunho fictício",
      activityDescription: "Atividades a confirmar em campo.",
      riskInventory: "Outro: relato informado pela equipe; validar antes de classificar.",
      actionPlan: "Ação e responsável a definir pela organização.",
    };

    const created = savePgrDraft("tenant-horizonte", input, actor);
    assert.ok(created);
    assert.deepEqual(listPgrDraftsForTenant("tenant-aurora"), []);
    assert.equal(created.riskInventory, input.riskInventory);

    const updated = savePgrDraft("tenant-horizonte", { ...input, title: "Rascunho fictício revisado" }, actor, created.id, created.revision);
    assert.ok(updated);
    assert.equal(updated.revision, 2);
    assert.equal(updated.revisions[0].riskInventory, input.riskInventory);
    assert.equal(updated.revisions[1].riskInventory, input.riskInventory);

    assert.equal(savePgrDraft("tenant-aurora", { ...input, title: "Tentativa cruzada" }, actor, created.id, updated.revision), null);
    assert.equal(savePgrDraft("tenant-horizonte", { ...input, title: "Edição desatualizada" }, actor, created.id, created.revision), null);
    assert.equal(savePgrDraft("tenant-horizonte", { ...input, unitId: "outra-unidade" }, actor, created.id, updated.revision), null);
    assert.equal(transitionPgrDraft("tenant-aurora", created.id, "in_review", actor, updated.revision), null);
    assert.equal(transitionPgrDraft("tenant-horizonte", created.id, "approved", actor, updated.revision), null);
    const submitted = transitionPgrDraft("tenant-horizonte", created.id, "in_review", actor, updated.revision);
    assert.equal(submitted?.status, "in_review");
    assert.equal(submitted?.revision, 3);
    assert.equal(transitionPgrDraft("tenant-horizonte", created.id, "approved", actor, updated.revision), null);
    const reviewed = transitionPgrDraft("tenant-horizonte", created.id, "approved", actor, submitted!.revision);
    assert.equal(reviewed?.status, "approved");
    assert.equal(transitionPgrDraft("tenant-horizonte", created.id, "in_review", actor, reviewed!.revision), null);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
