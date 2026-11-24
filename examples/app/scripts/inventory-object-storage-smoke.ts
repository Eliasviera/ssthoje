import { PDFDocument } from "pdf-lib";
import { createMagaluInventoryObjectStore } from "../src/lib/inventory-magalu-object-store.ts";

// Executar somente em bucket privado dedicado, após aprovação de custo/configuração.
async function main() {
  const env = process.env;
  if (env.SST_OBJECT_SANDBOX_ACK !== "TESTE_FICTICIO_AUTORIZADO" || !env.SST_OBJECT_BUCKET?.endsWith("-sandbox")) {
    throw new Error("Teste bloqueado: exige aceite explícito e bucket dedicado com sufixo -sandbox.");
  }
  const region = env.SST_OBJECT_REGION;
  if (region !== "br-se1" && region !== "br-ne1") throw new Error("Informe uma região Magalu válida.");
  const store = createMagaluInventoryObjectStore({
    region, bucket: env.SST_OBJECT_BUCKET,
    accessKeyId: env.SST_OBJECT_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.SST_OBJECT_SECRET_ACCESS_KEY ?? "",
    maxFileBytes: 1024 * 1024,
  }, async (_action, resourceId) => ({ tenantId: "sandbox-ficticio", actorId: "teste-ficticio", resourceId }));
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]).drawText("CROQUI FICTICIO - TESTE", { x: 10, y: 100, size: 10 });
  const receipt = await store.put("croqui-ficticio", "application/pdf", await pdf.save());
  const loaded = await PDFDocument.load(await store.get(receipt));
  if (loaded.getPageCount() !== 1) throw new Error("PDF recuperado inválido.");
  const signed = await store.temporaryDownload(receipt, 60);
  const authenticated = await fetch(signed, { redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!authenticated.ok) throw new Error("Download temporário falhou.");
  await PDFDocument.load(await authenticated.arrayBuffer());
  const publicUrl = new URL(signed); publicUrl.search = "";
  const anonymous = await fetch(publicUrl, { redirect: "error", signal: AbortSignal.timeout(20000) });
  await anonymous.body?.cancel();
  if (anonymous.status !== 403) throw new Error("Privacidade não confirmada: acesso anônimo precisa retornar 403.");
  console.log("Teste real aprovado: PDF enviado, recuperado, link temporário válido e acesso anônimo negado. Arquivo fictício preservado no bucket.");
}

main().catch(() => {
  // Não expor erros do SDK, URLs assinadas, headers ou credenciais nos logs.
  console.error("Teste não concluído. Confira aceite, bucket privado com versionamento, região e credenciais locais. Nenhum arquivo é excluído automaticamente.");
  process.exitCode = 1;
});
