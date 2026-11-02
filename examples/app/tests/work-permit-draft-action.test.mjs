import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

// Only the action is real: session, storage, audit and cache are isolated doubles.
const state = { access: null, calls: [], aprs: [], result: { id: "draft-test" } };
globalThis.__permitActionTest = state;
const moduleSource = {
  "next/cache": "export const revalidatePath=(path)=>globalThis.__permitActionTest.calls.push(['cache',path]);",
  "@/lib/audit-log": "export const appendAuditEvent=(event)=>globalThis.__permitActionTest.calls.push(['audit',event]);",
  "@/lib/tenant-context": "export const getCurrentTenantAccess=async(permission)=>{globalThis.__permitActionTest.calls.push(['access',permission]);return globalThis.__permitActionTest.access;};",
  "@/lib/pgr-postgres-store": "export const listPgrInventoriesPostgres=()=>{throw new Error('Unexpected PGR access')};",
  "@/lib/pgr-storage-mode": "export const getPgrStorageMode=()=>{throw new Error('Unexpected PGR access')};",
  "@/lib/safety-apr-pgr-selection": "export const selectApprovedPgrRisks=()=>{throw new Error('Unexpected PGR access')};",
  "@/lib/work-permit-draft-store": "export const createWorkPermitDraft=async(input)=>{globalThis.__permitActionTest.calls.push(['create',input]);return globalThis.__permitActionTest.result;};export const updateWorkPermitDraft=async(...args)=>{globalThis.__permitActionTest.calls.push(['update',...args]);return globalThis.__permitActionTest.result;};",
  "@/lib/safety-operations-store": "export class SafetyOperationsValidationError extends Error{};export const listSafetyAprs=(tenant)=>{globalThis.__permitActionTest.calls.push(['aprs',tenant]);return globalThis.__permitActionTest.aprs.filter(apr=>apr.tenantId===tenant);};export const createSafetyApr=()=>{};export const createSafetyChecklistTemplate=()=>{};export const activateSafetyChecklistTemplate=()=>{};export const saveSafetyAprAnswers=()=>{};export const submitSafetyAprForReview=()=>{};",
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (moduleSource[specifier]) return { url: `data:text/javascript,${encodeURIComponent(moduleSource[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { saveWorkPermitDraftAction } = await import("../src/app/safety-operations-actions.ts");
hooks.deregister();

function reset() {
  state.access = { authenticated: true, context: { tenant: { id: "tenant-test" }, membership: { role: "consultoria_admin" } }, session: { userId: "session-actor" } };
  state.calls = []; state.aprs = []; state.result = { id: "draft-test" };
}
function form() {
  const data = new FormData();
  data.set("mapId", "pte-confined-space"); data.set("title", "Rascunho sintético");
  data.set("field.identity-activity.company", "Empresa fictícia");
  return data;
}
function noSideEffects() {
  assert.ok(state.calls.every(([kind]) => ["access", "aprs"].includes(kind)), "Entrada recusada não pode gravar, auditar ou invalidar cache");
}
test("action PT/PTE valida autorização e entrada antes de qualquer escrita", async (t) => {
  try {
    await t.test("sessão ausente e conta sem permissão são recusadas", async () => {
      for (const access of [{ authenticated: false }, { authenticated: true, context: null }]) {
        reset(); state.access = access;
        assert.match((await saveWorkPermitDraftAction({}, form())).error, /conta autorizada/);
        noSideEffects();
      }
    });
    await t.test("modelo desconhecido, título vazio e campo estranho são recusados", async () => {
      for (const [key, value] of [["mapId", "unknown"], ["title", " "], ["field.unknown", "sintético"], ["field.identity-activity.company", "x".repeat(3001)]]) {
        reset(); const data = form(); data.set(key, value);
        assert.ok((await saveWorkPermitDraftAction({}, data)).error); noSideEffects();
      }
    });
    await t.test("campo em branco não satisfaz preenchimento mínimo", async () => {
      reset(); const data = form(); data.set("field.identity-activity.company", "  ");
      assert.match((await saveWorkPermitDraftAction({}, data)).error, /ao menos um campo/); noSideEffects();
    });
    await t.test("arquivo em campo textual é recusado mesmo com outro campo válido", async () => {
      reset(); const data = form(); data.set("field.identity-activity.work-description", new Blob(["synthetic"]), "fixture.txt");
      assert.ok((await saveWorkPermitDraftAction({}, data)).error); noSideEffects();
    });
    await t.test("identificador de APR inválido não vira vínculo vazio", async () => {
      for (const value of ["x".repeat(37), new Blob(["synthetic"])]) {
        reset(); const data = form(); data.set("aprId", value);
        assert.ok((await saveWorkPermitDraftAction({}, data)).error); noSideEffects();
      }
    });
    await t.test("APR de outro cliente é recusada", async () => {
      reset(); state.aprs = [{ id: "apr-foreign", tenantId: "other-tenant" }];
      const data = form(); data.set("aprId", "apr-foreign");
      assert.match((await saveWorkPermitDraftAction({}, data)).error, /não está disponível/);
      assert.ok(state.calls.some(([kind, tenant]) => kind === "aprs" && tenant === "tenant-test")); noSideEffects();
    });
    await t.test("edição sem revisão válida e ID longo são recusados", async () => {
      for (const revision of ["", "0", "1.5", "-1", "abc"]) {
        reset(); const data = form(); data.set("draftId", "draft-test"); data.set("draftRevision", revision);
        assert.ok((await saveWorkPermitDraftAction({}, data)).error); noSideEffects();
      }
      reset(); const data = form(); data.set("draftId", "x".repeat(37));
      assert.ok((await saveWorkPermitDraftAction({}, data)).error); noSideEffects();
    });
    await t.test("criação usa identidade da sessão e aceita limite de 3000 caracteres", async () => {
      reset(); const data = form(); data.set("tenantId", "forged-tenant"); data.set("createdBy", "forged-user");
      data.set("field.identity-activity.company", "x".repeat(3000));
      data.set("aprId", "apr-local"); state.aprs = [{ id: "apr-local", tenantId: "tenant-test" }];
      assert.ok((await saveWorkPermitDraftAction({}, data)).success);
      const input = state.calls.find(([kind]) => kind === "create")[1];
      assert.equal(input.tenantId, "tenant-test"); assert.equal(input.createdBy, "session-actor");
      assert.equal(input.aprId, "apr-local"); assert.equal(input.values["identity-activity.company"].length, 3000);
      assert.equal(state.calls.filter(([kind]) => kind === "audit").length, 1);
      assert.equal(state.calls.find(([kind]) => kind === "audit")[1].actorUserId, "session-actor");
    });
    await t.test("edição envia revisão esperada e autoria da sessão", async () => {
      reset(); const data = form(); data.set("draftId", "draft-test"); data.set("draftRevision", "2"); data.set("updatedBy", "forged-user");
      assert.ok((await saveWorkPermitDraftAction({}, data)).success);
      const [, tenant, id, input] = state.calls.find(([kind]) => kind === "update");
      assert.equal(tenant, "tenant-test"); assert.equal(id, "draft-test");
      assert.equal(input.expectedRevision, 2); assert.equal(input.updatedBy, "session-actor");
    });
    await t.test("conflito de edição não gera evento de sucesso", async () => {
      reset(); state.result = null; const data = form(); data.set("draftId", "draft-test"); data.set("draftRevision", "1");
      assert.match((await saveWorkPermitDraftAction({}, data)).error, /Reabra a versão atual/);
      assert.equal(state.calls.filter(([kind]) => ["audit", "cache"].includes(kind)).length, 0);
    });
  } finally { delete globalThis.__permitActionTest; }
});
