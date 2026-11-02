import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const state = { access: null, calls: [], throwParser: false };
globalThis.__epiStockPdfRouteTest = state;
const modules = {
  "next/server": "export class NextRequest{};export class NextResponse extends Response{static json(body,init={}){return new Response(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}});}}",
  "@/lib/tenant-context": "export const getCurrentTenantAccess=async(permission)=>{globalThis.__epiStockPdfRouteTest.calls.push(['access',permission]);return globalThis.__epiStockPdfRouteTest.access;};",
  "@/lib/epi-stock-pdf-extractor": "export const extractEpiStockDocumentFields=async(bytes)=>{globalThis.__epiStockPdfRouteTest.calls.push(['extract',bytes.byteLength]);if(globalThis.__epiStockPdfRouteTest.throwParser)throw new Error('private parser detail');return bytes.includes(78)?{fields:{},hasText:false}:{fields:{quantity:'7'},hasText:true};};",
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { POST } = await import("../src/app/api/epi/stock-document/extract/route.ts");
hooks.deregister();
test.after(() => { delete globalThis.__epiStockPdfRouteTest; });

function reset(access = { authenticated: true, context: { tenant: { id: "tenant-test" } } }) {
  state.access = access;
  state.calls = [];
  state.throwParser = false;
}

function request(file) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/epi/stock-document/extract", { method: "POST", body: form });
}

test("rota de extração exige sessão e permissão antes de processar arquivo", async () => {
  for (const [access, status] of [[{ authenticated: false }, 401], [{ authenticated: true, context: null }, 403]]) {
    reset(access);
    const response = await POST(request());
    assert.equal(response.status, status);
    assert.deepEqual(state.calls, [["access", "epi.manage"]]);
  }
});

test("rota valida a seleção e o tamanho do PDF antes da extração", async () => {
  reset();
  assert.equal((await POST(request())).status, 400);
  assert.equal((await POST(request(new File(["%PDF-test"], "fixture.txt", { type: "text/plain" })))).status, 400);
  assert.equal((await POST(request(new File([new Uint8Array(15 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })))).status, 400);
  assert.equal(state.calls.filter(([kind]) => kind === "extract").length, 0);
});

test("rota devolve somente sugestões e não o texto extraído", async () => {
  reset();
  const response = await POST(request(new File(["%PDF-searchable"], "fixture.pdf", { type: "application/pdf" })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { ok: true, fields: { quantity: "7" } });
  assert.deepEqual(state.calls, [["access", "epi.manage"], ["extract", 15]]);
});

test("rota identifica PDF sem texto e orienta sobre OCR indisponível", async () => {
  reset();
  const response = await POST(request(new File(["%PDF-NO_TEXT"], "scan.pdf", { type: "application/pdf" })));
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /não contém texto selecionável.*OCR/i);
  assert.equal(state.calls.at(-1)[0], "extract");
});

test("rota não revela detalhes internos em erro do parser", async () => {
  reset();
  state.throwParser = true;
  const response = await POST(request(new File(["%PDF-failure"], "broken.pdf", { type: "application/pdf" })));
  assert.equal(response.status, 422);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private parser detail/);
});
