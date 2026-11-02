import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { changeSiteContent, getSiteEditor, getPublicSiteContent } from "../src/lib/site-store.ts";
import { DEFAULT_SITE_CONTENT, type SiteContent } from "../src/lib/site-content.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
const original = process.cwd(), master = "sst-demo-master";
const changed = (): SiteContent => ({ ...structuredClone(DEFAULT_SITE_CONTENT), headline: "Título fictício para teste M18" });
beforeEach(() => { mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "site-tests-"))); });
afterEach(() => process.chdir(original));
test("site: editor, gravação e publicação exclusivos ao Master; público não revela rascunho", () => {
  for (const user of ["", "desconhecido", "sst-demo-user", "sst-demo-sst", "sst-demo-medico", "sst-demo-user-b"]) {
    assert.throws(() => getSiteEditor(user)); assert.throws(() => changeSiteContent(user, "save", 0, "Teste", changed())); assert.throws(() => changeSiteContent(user, "publish", 0, "Teste"));
  }
  changeSiteContent(master, "save", 0, "Rascunho fictício", changed());
  assert.equal(getPublicSiteContent().headline, DEFAULT_SITE_CONTENT.headline);
  assert.equal(getSiteEditor(master).draft.content.headline, changed().headline);
  assert.equal("history" in getPublicSiteContent(), false);
  assert.ok(listAuditEventsForTenant("platform").some(e => e.action === "platform.access_denied"));
});
test("site: publicação guarda cópias e revisões; novo rascunho não muda versão vigente", () => {
  changeSiteContent(master, "save", 0, "Primeira revisão", changed()); changeSiteContent(master, "publish", 1, "Publicação fictícia");
  assert.equal(getPublicSiteContent().headline, changed().headline);
  const next = { ...changed(), headline: "Segunda revisão fictícia", image: "brand" as const };
  changeSiteContent(master, "save", 1, "Outra revisão", next);
  assert.equal(getPublicSiteContent().headline, changed().headline);
  changeSiteContent(master, "publish", 2, "Nova publicação fictícia");
  const state = getSiteEditor(master);
  assert.equal(state.history.length, 4); assert.equal(state.history[3].before?.content.headline, changed().headline);
  assert.equal(state.published?.content.image, "brand");
  const publicCopy = getPublicSiteContent(); publicCopy.headline = "Alteração externa";
  assert.equal(getPublicSiteContent().headline, next.headline);
  assert.ok(listAuditEventsForTenant("platform").every(e => !("reason" in e)));
});
test("site: formulário antigo e publicação repetida não sobrescrevem; valores inválidos não persistem", () => {
  changeSiteContent(master, "save", 0, "Teste", changed());
  const before = readFileSync("data/site-content.json", "utf8");
  assert.throws(() => changeSiteContent(master, "publish", 0, "Antigo"));
  assert.throws(() => changeSiteContent(master, "save", 0, "Antigo", changed()));
  for (const content of [{ ...changed(), image: "https://externo.invalid" }, { ...changed(), headline: " " }, { ...changed(), headline: "x".repeat(101) }, { ...changed(), faq: [] }, { ...changed(), plans: [null, null] }]) assert.throws(() => changeSiteContent(master, "save", 1, "Teste", content as SiteContent));
  assert.equal(readFileSync("data/site-content.json", "utf8"), before);
  changeSiteContent(master, "publish", 1, "Publicação");
  assert.throws(() => changeSiteContent(master, "publish", 1, "Repetida"), /já está publicada/);
});
test("site: entrada é texto estruturado; dados extra não entram na página e imagens são fechadas", () => {
  const input = { ...changed(), headline: "Texto literal <script>fictício</script>", token: "SEGREDO_FICTICIO_EXCLUIR" };
  changeSiteContent(master, "save", 0, "Teste de projeção", input);
  changeSiteContent(master, "publish", 1, "Teste de publicação");
  const publicContent = getPublicSiteContent();
  assert.equal(publicContent.headline, input.headline); // React renderiza como texto, sem dangerouslySetInnerHTML.
  assert.equal(JSON.stringify(publicContent).includes("SEGREDO_FICTICIO_EXCLUIR"), false);
  assert.equal(Object.keys(publicContent).length, 7);
});
