import assert from "node:assert/strict";
import test from "node:test";
import { extractEpiStockDocumentFields } from "../src/lib/epi-stock-pdf-extractor.ts";

const pdf = Buffer.from("%PDF-1.7\nsynthetic");
const searchablePdf = Buffer.from(
  "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA2IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNiAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYxMTAxMTYwNTAyLTAzJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYxMTAxMTYwNTAyLTAzJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKNyAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAyOTkKPj4Kc3RyZWFtCkdhczJEMGksXEAnU1E1W01BbUI0IU83V1RbLCs+RVVkdTYtQCEvcWYsOG0+J2FFODhJNGQqdGcmbi0oN0k8WUZHSzdTVTozdWloKlRdZUFGSjlfNmBHN25NR2V1V1dYL2BLUzhRIXVGOz5XdSNqa2VfJjxVUDwwVj4mUnFzIm5ONEZyPElIdTE9XTZscjg4U2FOSSUwW0QqWWAhUVNDKktwPzU6PiUiZmljX0ZHazEtZHBYOThqNisqbzE4a0Y0SVFNUjh1Yj1wRWA2U2JyRzhBR1M5OC81PiNuX2pYUFFrRylJOzZmXj9NOC46JkFcWkFaLmBbRjBLLWFwc2thaUp1TSdqblA/KUcwNk9LRDdFZVwkMj9xVFNcVV89KTVAOz1uJF1ySkwzV34+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDAzOTIgMDAwMDAgbiAKMDAwMDAwMDQ2MCAwMDAwMCBuIAowMDAwMDAwNzIxIDAwMDAwIG4gCjAwMDAwMDA3ODAgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MzYyMGZjNjU2NWUwNzg5ZDA5YzEwNjY5OTM4OWI3MWE+PDM2MjBmYzY1NjVlMDc4OWQwOWMxMDY2OTkzODliNzFhPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgoxMTY5CiUlRU9GCg==",
  "base64",
);
const textlessPdf = Buffer.from(
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgKHB5cGRmKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDEKL0tpZHMgWyA0IDAgUiBdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDU0IDAwMDAwIG4gCjAwMDAwMDAxMTMgMDAwMDAgbiAKMDAwMDAwMDE2MiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDUKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjI1NgolJUVPRgo=",
  "base64",
);

test("carrega o parser sem executar a rotina de depuração do pacote", async () => {
  const parser = await import("pdf-parse/lib/pdf-parse.js");
  assert.equal(typeof parser.default, "function");
});

test("extrai campos rotulados de um PDF pesquisável real", async () => {
  const { fields, hasText } = await extractEpiStockDocumentFields(searchablePdf);
  assert.equal(hasText, true);
  assert.deepEqual(fields, {
    productName: "Protetor de teste CA 5745",
    ca: "5745",
    quantity: "7",
    sourceReference: "20578946",
    supplier: "Bunzai EPI",
    batchCode: "FICTICIO-TESTE",
    productValidUntil: "2027-05-12",
    unitCost: "4,25",
  });
});

test("reconhece PDF válido sem camada de texto como não pesquisável", async () => {
  const result = await extractEpiStockDocumentFields(textlessPdf);
  assert.deepEqual(result, { fields: {}, hasText: false });
});

test("extrai campos rotulados de documento pesquisável sem inventar campos ausentes", async () => {
  const { fields, hasText } = await extractEpiStockDocumentFields(pdf, async () => ({
    text: [
      "Nota Fiscal: 20578945",
      "Fornecedor: Bunzai EPI",
      "Descrição do produto: Protetor auditivo CA 5745",
      "Quantidade: 10",
      "Lote: FICTICIO-205",
      "Validade do produto: 12/05/2027",
      "Valor unitário: R$ 3,95",
    ].join("\n"),
  }));
  assert.equal(hasText, true);
  assert.deepEqual(fields, {
    productName: "Protetor auditivo CA 5745",
    ca: "5745",
    quantity: "10",
    sourceReference: "20578945",
    supplier: "Bunzai EPI",
    batchCode: "FICTICIO-205",
    productValidUntil: "2027-05-12",
    unitCost: "3,95",
  });
});

test("separa rótulos adjacentes e reconhece variações comuns de NF-e", async () => {
  const { fields } = await extractEpiStockDocumentFields(pdf, async () => ({
    text: "NF-e nº 20578946  Fornecedor: Bunzai EPI  Qtd.: 12 un.  Produto: Protetor de teste CA 5745  Lote: FICTICIO-12 Validade: 12/05/2027  Vlr. Un.: R$ 1.234,50",
  }));
  assert.deepEqual(fields, {
    productName: "Protetor de teste CA 5745",
    ca: "5745",
    quantity: "12",
    sourceReference: "20578946",
    supplier: "Bunzai EPI",
    batchCode: "FICTICIO-12",
    productValidUntil: "2027-05-12",
    unitCost: "1.234,50",
  });
});

test("sinaliza PDF sem camada de texto para uso futuro de OCR", async () => {
  const result = await extractEpiStockDocumentFields(pdf, async () => ({ text: "" }));
  assert.deepEqual(result, { fields: {}, hasText: false });
});

test("rejeita arquivo que não seja PDF ou esteja acima do limite", async () => {
  await assert.rejects(() => extractEpiStockDocumentFields(Buffer.from("not pdf")), /PDF válido/i);
  await assert.rejects(() => extractEpiStockDocumentFields(Buffer.alloc(15 * 1024 * 1024 + 1)), /PDF válido/i);
});
