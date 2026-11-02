import assert from "node:assert/strict";
import test from "node:test";
import { extractFullPdfText } from "../src/lib/pdf-full-text.ts";

test("texto integral preserva mais de 80 páginas e identifica lacunas e falhas", async () => {
  const result = await extractFullPdfText(Buffer.from("%PDF-fixture"), async (_bytes, options) => {
    assert.equal(options.max, 0);
    for (let number = 1; number <= 240; number++) {
      if (number === 10) continue;
      await options.pagerender({ pageNumber: number, async getTextContent() {
        if (number === 11) throw new Error("fixture failure");
        return { items: number === 12 ? [] : [{ str: `Página ${number}`, transform: [1, 0, 0, 1, 20, 30] }, { str: "<script>não executar</script>", transform: [1, 0, 0, 1, 50, 30] }] };
      } });
    }
    return { numpages: 240 };
  });
  assert.equal(result.pages.length, 240);
  assert.equal(result.pages[9].status, "failed");
  assert.equal(result.pages[10].status, "failed");
  assert.equal(result.pages[11].status, "no_text");
  assert.match(result.pages[239].text, /Página 240/);
  assert.match(result.pages[239].text, /<script>/);
  assert.equal(result.sha256.length, 64);
});

test("PDF inválido ou parser sem contagem não vira extração vazia bem sucedida", async () => {
  await assert.rejects(extractFullPdfText(Buffer.from("texto")));
  await assert.rejects(extractFullPdfText(Buffer.from("%PDF-fixture"), async () => ({ numpages: 0 })));
});
