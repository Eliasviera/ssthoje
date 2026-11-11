import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireTenantAccess } from "../src/lib/tenant-access.ts";
import { resolveClientCompanyScope, scopeClientCompanies } from "../src/lib/client-company-scope.ts";
import { listDdsForAccess, listInspectionsForAccess, listDeviationsForAccess } from "../src/lib/company-scoped-reads.ts";
import { createDds } from "../src/lib/dds-store.ts";
import { createTemplate, completeInspection } from "../src/lib/checklist-store.ts";

// Somente a fronteira de sessão/Next e o catálogo são simulados.
// Autorização, vínculos, leitores, escrita de desvios e geração de PDF são reais.
const state = { userId: "sst-demo-client-authority", companies: [] };
globalThis.__companyIsolation = state;
state.authorize = async (permission) => {
  const result = requireTenantAccess(state.userId, permission);
  return { authenticated: Boolean(state.userId), session: { userId: state.userId }, context: result.ok ? result.context : null };
};
const mocks = {
  "next/cache": "export const revalidatePath=()=>{};",
  "@/lib/tenant-context": "export const getCurrentTenantAccess=(p)=>globalThis.__companyIsolation.authorize(p);",
  "@/lib/client-service": "export const listClientCompanies=async(t)=>globalThis.__companyIsolation.companies.filter(c=>c.tenantId===t);",
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { GET: ddsPdf } = await import("../src/app/api/dds/[id]/pdf/route.ts");
const { GET: checklistPdf } = await import("../src/app/api/checklists/[id]/pdf/route.ts");
const { reportDeviationAction, transitionDeviationAction } = await import("../src/app/desvios/actions.ts");
hooks.deregister();

const tenantId = "tenant-horizonte";
const userId = "sst-demo-client-authority";
const binding = (companyId = "company-a", unitId = "unit-a") => ({
  id: "binding-test", revision: 1, userId, tenantId, companyId, unitIds: [unitId], status: "active",
  validFrom: "2020-01-01T00:00:00Z", validUntil: "2099-01-01T00:00:00Z",
  reviewedByUserId: "reviewer-test", reviewReference: "Revisão sintética",
});
const writeBindings = (rows) => writeFileSync("data/client-company-access.json", JSON.stringify(rows));
const requestPdf = (handler, id) => handler(new Request("http://localhost/test"), { params: Promise.resolve({ id }) });
const form = (scope) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ scope, kind: "deviation", occurredOn: "2026-11-03", location: "Local fictício", description: "Descrição sintética", immediateAction: "", tenantId: "tenant-adulterado", actorUserId: "ator-adulterado" })) data.set(key, value);
  return data;
};

test("isolamento de empresa: leitores, ações e PDFs reais com sessão simulada", async (t) => {
  const original = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "sst-company-isolation-"));
  process.chdir(directory);
  try {
    mkdirSync("data");
    state.companies = ["a", "b"].map((suffix) => ({ id: `company-${suffix}`, tenantId, status: "active", legalName: `Empresa fictícia ${suffix}`, units: [{ id: `unit-${suffix}`, name: "Unidade fictícia" }, { id: "unit-extra", name: "Unidade restrita" }] }));
    writeBindings([binding()]);
    const rows = [
      { companyId: "company-a", unitId: "unit-a", tenantId },
      { companyId: "company-b", unitId: "unit-b", tenantId },
      { companyId: "company-a", unitId: "unit-extra", tenantId },
      { companyId: "company-a", unitId: "unit-a", tenantId: "tenant-aurora" },
    ];
    const dds = rows.map((row) => createDds({ ...row, heldOn: "2026-11-03", location: "Local fictício", responsible: "Responsável fictício", notes: "", attendees: [{ workerName: "Participante fictício" }], actorUserId: "synthetic-author" }));
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    // O validador exige tamanho mínimo; o PNG real é seguido de padding para a fixture.
    const image = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(",")[1], "base64"), Buffer.alloc(200)]).toString("base64")}`;
    const inspections = rows.map((row) => {
      const template = createTemplate({ tenantId: row.tenantId, kind: "area", name: "Modelo fictício", items: ["Item fictício"], actorUserId: "synthetic-author" });
      return completeInspection({ ...row, templateId: template.id, subject: "Objeto fictício", performedOn: "2026-11-03", inspector: "Inspetor fictício", answers: { [template.items[0].id]: { answer: "ok", note: "" } }, image, actorUserId: "synthetic-author" });
    });

    await t.test("lista somente empresa/unidade autorizada e separa a segunda empresa", () => {
      for (const [index, scope] of [[0, binding()], [1, binding("company-b", "unit-b")]]) {
        writeBindings([scope]);
        const context = requireTenantAccess(userId, "dds.read").context;
        assert.deepEqual(listDdsForAccess(context).map((row) => row.id), [dds[index].id]);
        assert.deepEqual(listInspectionsForAccess(context).map((row) => row.id), [inspections[index].id]);
        const companies = scopeClientCompanies(context, state.companies);
        assert.deepEqual(companies.map((row) => row.id), [scope.companyId]);
        assert.deepEqual(companies[0].units.map((unit) => unit.id), scope.unitIds);
      }
      writeBindings([binding()]);
    });
    await t.test("PDF próprio retorna arquivo; IDs de outra empresa/unidade/tenant retornam 404", async () => {
      for (const [handler, records] of [[ddsPdf, dds], [checklistPdf, inspections]]) {
        const own = await requestPdf(handler, records[0].id);
        assert.equal(own.status, 200);
        assert.equal(own.headers.get("Cache-Control"), "private, no-store");
        assert.equal(Buffer.from(await own.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
        for (const record of records.slice(1)) assert.equal((await requestPdf(handler, record.id)).status, 404);
      }
    });
    await t.test("escrita rejeita empresa/unidade adulterada e deriva ator/tenant do servidor", async () => {
      for (const scope of ["", "company-b|unit-b", "company-a|unit-extra"]) assert.ok((await reportDeviationAction({}, form(scope))).error);
      assert.ok((await reportDeviationAction({}, form("company-a|unit-a"))).success);
      const stored = JSON.parse(readFileSync("data/deviations.json", "utf8"));
      assert.equal(stored.length, 1);
      assert.equal(stored[0].tenantId, tenantId);
      assert.equal(stored[0].createdByUserId, userId);
      assert.ok((await transitionDeviationAction({}, form(""))).error);
      writeBindings([binding("company-b", "unit-b")]);
      const context = requireTenantAccess(userId, "deviation.report").context;
      assert.deepEqual(listDeviationsForAccess(context, { userId, canManage: false }), []);
      writeBindings([binding()]);
    });
    await t.test("revogação com sessão preservada bloqueia nova leitura, download e escrita", async () => {
      writeBindings([{ ...binding(), status: "revoked" }]);
      for (const permission of ["dds.read", "checklist.read", "deviation.report", "dds.manage", "checklist.apply"]) assert.equal(requireTenantAccess(userId, permission).ok, false);
      assert.equal((await requestPdf(ddsPdf, dds[0].id)).status, 403);
      assert.equal((await requestPdf(checklistPdf, inspections[0].id)).status, 403);
      assert.ok((await reportDeviationAction({}, form("company-a|unit-a"))).error);
      assert.equal(JSON.parse(readFileSync("data/deviations.json", "utf8")).length, 1);
    });
    await t.test("ausência, duplicidade, expiração e arquivo inválido negam vínculo", () => {
      for (const rows of [[], [binding(), binding()], [{ ...binding(), validUntil: "2021-01-01T00:00:00Z" }]]) {
        writeBindings(rows);
        assert.equal(resolveClientCompanyScope(userId, tenantId), null);
      }
      writeFileSync("data/client-company-access.json", "{");
      assert.equal(requireTenantAccess(userId, "dds.read").ok, false);
    });
  } finally {
    process.chdir(original);
    delete globalThis.__companyIsolation;
    // Diretório temporário preservado para inspeção; nenhum dado ativo é usado.
  }
});
