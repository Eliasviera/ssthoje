import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerHooks } from "node:module";

// O cenário exercita apenas o fallback local. Qualquer transação SQL é falha.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./tenant-read-transaction" || specifier === "./tenant-write-transaction") {
    return { url: "data:text/javascript,export function withCurrentTenantReadTransaction(){throw new Error('Unexpected SQL transaction')} export function withCurrentTenantWriteTransaction(){throw new Error('Unexpected SQL transaction')}", shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
const { createWorkPermitDraft, getWorkPermitDraft, getWorkPermitDraftRevision, getWorkPermitDraftRevisionsPair, listWorkPermitDrafts, updateWorkPermitDraft } = await import("../src/lib/work-permit-draft-store.ts");
hooks.deregister();

test("rascunhos PT/PTE locais preservam isolamento, revisões e conflitos", async (t) => {
  const originalDirectory = process.cwd();
  const originalPassword = process.env.PGPASSWORD;
  const temporaryDirectory = mkdtempSync(join(originalDirectory, ".sst-permit-test-"));
  delete process.env.PGPASSWORD;
  process.chdir(temporaryDirectory);
  try {
    const draft = await createWorkPermitDraft({
      tenantId: "tenant-ficticio-a", mapId: "pte-confined-space",
      title: "Rascunho sintético", values: { company: "Empresa fictícia" }, createdBy: "usuario-ficticio-a",
    });
    await t.test("criação permanece demonstrativa e registra a primeira revisão", async () => {
      assert.equal(draft.status, "draft_demo");
      assert.equal(draft.revision, 1);
      assert.deepEqual(draft.revisionHistory?.map((entry) => entry.revision), [1]);
      assert.equal((await listWorkPermitDrafts(draft.tenantId)).length, 1);
    });
    const edit = { mapId: draft.mapId, title: "Título revisado", values: { company: "Empresa fictícia revisada" }, updatedBy: "usuario-ficticio-b", expectedRevision: 1 };
    await t.test("outro cliente não lê nem altera o registro", async () => {
      assert.equal(await getWorkPermitDraft("tenant-ficticio-b", draft.id), null);
      assert.deepEqual(await listWorkPermitDrafts("tenant-ficticio-b"), []);
      assert.equal(await updateWorkPermitDraft("tenant-ficticio-b", draft.id, edit), null);
    });
    await t.test("edição avança a revisão e preserva autoria do histórico", async () => {
      const updated = await updateWorkPermitDraft(draft.tenantId, draft.id, edit);
      assert.equal(updated?.revision, 2);
      assert.equal(updated?.status, "draft_demo");
      assert.deepEqual(updated?.revisionHistory?.map((entry) => [entry.revision, entry.actorUserId]), [[1, "usuario-ficticio-a"], [2, "usuario-ficticio-b"]]);
      assert.equal((await getWorkPermitDraft(draft.tenantId, draft.id))?.title, edit.title);
    });
    await t.test("consulta histórica preserva conteúdo antigo e recusa outro tenant/revisão ausente", async () => {
      const original = await getWorkPermitDraftRevision(draft.tenantId, draft.id, 1);
      const current = await getWorkPermitDraftRevision(draft.tenantId, draft.id, 2);
      assert.equal(original.title, "Rascunho sintético");
      assert.equal(original.values.company, "Empresa fictícia");
      assert.equal(current.title, edit.title);
      original.values.company = "Mutação externa";
      assert.equal((await getWorkPermitDraftRevision(draft.tenantId, draft.id, 1)).values.company, "Empresa fictícia");
      assert.equal(await getWorkPermitDraftRevision("tenant-ficticio-b", draft.id, 1), null);
      for (const revision of [0, -1, 1.5, 3, 2147483648]) assert.equal(await getWorkPermitDraftRevision(draft.tenantId, draft.id, revision), null);
    });
    await t.test("comparação mantém tenant, rejeita versões inválidas e não grava", async () => {
      const target = join(temporaryDirectory, "data", "work-permit-drafts.json");
      const before = readFileSync(target, "utf8");
      const pair = await getWorkPermitDraftRevisionsPair(draft.tenantId, draft.id, 2, 1);
      assert.equal(pair.left.revision, 2);
      assert.equal(pair.right.title, "Rascunho sintético");
      assert.equal(await getWorkPermitDraftRevisionsPair("tenant-ficticio-b", draft.id, 1, 2), null);
      for (const revision of [0, -1, 1.5, 3, 2147483648, NaN]) {
        assert.equal(await getWorkPermitDraftRevisionsPair(draft.tenantId, draft.id, 1, revision), null);
      }
      assert.equal(await getWorkPermitDraftRevisionsPair(draft.tenantId, draft.id, 1, 1), null);
      assert.equal(await getWorkPermitDraftRevisionsPair(draft.tenantId, "x".repeat(37), 1, 2), null);
      assert.equal(readFileSync(target, "utf8"), before);
    });
    await t.test("versão desatualizada e modelo divergente não sobrescrevem a edição", async () => {
      assert.equal(await updateWorkPermitDraft(draft.tenantId, draft.id, { ...edit, title: "Edição obsoleta" }), null);
      const otherMapId = "invalid-map";
      assert.equal(await updateWorkPermitDraft(draft.tenantId, draft.id, { ...edit, mapId: otherMapId, expectedRevision: 2 }), null);
      const current = await getWorkPermitDraft(draft.tenantId, draft.id);
      assert.equal(current?.title, edit.title);
      assert.equal(current?.revision, 2);
      assert.equal(current?.revisionHistory?.length, 2);
    });
    await t.test("histórico legado sem snapshot não inventa conteúdo antigo", async () => {
      const target = join(temporaryDirectory, "data", "work-permit-drafts.json");
      const records = JSON.parse(readFileSync(target, "utf8"));
      delete records[0].revisionHistory[0].snapshot;
      writeFileSync(target, JSON.stringify(records), "utf8");
      assert.equal(await getWorkPermitDraftRevision(draft.tenantId, draft.id, 1), null);
      assert.equal(await getWorkPermitDraftRevisionsPair(draft.tenantId, draft.id, 1, 2), null);
      assert.equal((await getWorkPermitDraft(draft.tenantId, draft.id)).revision, 2);
    });
  } finally {
    process.chdir(originalDirectory);
    if (originalPassword === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = originalPassword;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
