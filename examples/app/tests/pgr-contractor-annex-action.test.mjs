import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
const scope = { tenantId: "tenant-test", companyId: "company-test", unitId: "unit-test", sha256: "a".repeat(64) };
const state = { access: null, profile: scope, companies: [], writes: [], invalidations: [] };
globalThis.__annexActionTest = state;
const modules = {
  "next/cache": "export const revalidatePath=(path)=>globalThis.__annexActionTest.invalidations.push(path);",
  "@/lib/tenant-context": "export const getCurrentTenantAccess=async(permission)=>{if(permission!=='pgr.manage')throw new Error('Wrong permission');return globalThis.__annexActionTest.access;};",
  "@/lib/client-service": "export const listClientCompanies=async(tenant)=>{if(tenant!=='tenant-test')throw new Error('Wrong tenant');return globalThis.__annexActionTest.companies;};",
  "@/lib/pgr-digitalization-store": "export const readCompanyPgrDigitalization=(tenant,company)=>{if(tenant!=='tenant-test'||company!=='company-test')return null;return globalThis.__annexActionTest.profile;};",
  "@/lib/pgr-contractor-annex-store": "export const saveContractorAnnex=(input)=>{globalThis.__annexActionTest.writes.push(input);return {status:'draft'};};",
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { saveContractorAnnexAction } = await import("../src/app/pgr-contractor-annex-actions.ts");
hooks.deregister();
function reset() {
  state.access = { authenticated: true, context: { tenant: { id: "tenant-test" } }, session: { userId: "session-test" } };
  state.profile = { ...scope };
  state.companies = [{ id: "company-test", status: "active", units: [{ id: "unit-test" }] }];
  state.writes = []; state.invalidations = [];
}
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ companyId: scope.companyId, sha256: scope.sha256, operation: "save", revision: "0", title: "Anexo fictício", reason: "Teste sintético" })) data.set(key, value);
  return data;
}
test("action de anexo deriva identidade e escopo no servidor", async (t) => {
  try {
    await t.test("nega sessão e permissão ausentes antes de gravar", async () => {
      for (const access of [{ authenticated: false }, { authenticated: true, context: null }]) {
        reset(); state.access = access;
        assert.ok((await saveContractorAnnexAction({}, form())).error); assert.equal(state.writes.length, 0);
      }
    });
    await t.test("nega origem diferente, empresa inativa e unidade fora do PGR", async () => {
      for (const alter of [() => { state.profile = null; }, () => { state.profile.sha256 = "b".repeat(64); }, () => { state.companies[0].status = "inactive"; }, () => { state.companies[0].units = [{ id: "foreign-unit" }]; }]) {
        reset(); alter(); assert.ok((await saveContractorAnnexAction({}, form())).error); assert.equal(state.writes.length, 0);
      }
    });
    await t.test("usa tenant, unidade e ator da sessão/origem, ignorando valores forjados", async () => {
      reset(); const data = form(); data.set("tenantId", "forged"); data.set("unitId", "forged"); data.set("actorUserId", "forged");
      assert.ok((await saveContractorAnnexAction({}, data)).success);
      assert.deepEqual(state.writes[0].scope, scope); assert.equal(state.writes[0].actorUserId, "session-test");
      assert.deepEqual(state.invalidations, ["/empresas/company-test"]);
    });
    await t.test("recusa operação, revisão, arquivo ou texto fora do limite", async () => {
      for (const [key, value] of [["operation", "delete"], ["revision", "1.5"], ["reason", "x".repeat(2001)], ["activity", new Blob(["synthetic"])]] ) {
        reset(); const data = form(); data.set(key, value);
        assert.ok((await saveContractorAnnexAction({}, data)).error); assert.equal(state.writes.length, 0);
      }
    });
  } finally { delete globalThis.__annexActionTest; }
});
