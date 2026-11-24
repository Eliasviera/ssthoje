import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { requirePlatformMaster } from "./platform-service";
import { appendAuditEvent } from "./audit-log";
import { createMagaluInventoryObjectStore, type InventoryObjectReceipt } from "./inventory-magalu-object-store.ts";

type ProbeState = { bucket: string; attempts: number; lastAttempt: string; receipt?: InventoryObjectReceipt; verifiedAt?: string };
type ProbeStore = ReturnType<typeof createMagaluInventoryObjectStore>;
export type ProbeResult = { state: "disabled" | "ready" | "verified" | "pending"; attempts: number; verifiedAt?: string };
const failure = () => new Error("A verificação não foi concluída. Confira a configuração e o acesso ao armazenamento; o arquivo fictício pode ter sido preservado.");
function configuration() {
  const enabled = process.env.SST_OBJECT_PROBE_ENABLED === "1";
  const bucket = process.env.SST_OBJECT_BUCKET ?? "";
  return { enabled, bucket, ready: enabled && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) && ["br-se1", "br-ne1"].includes(process.env.SST_OBJECT_REGION ?? "") && Boolean(process.env.SST_OBJECT_ACCESS_KEY_ID && process.env.SST_OBJECT_SECRET_ACCESS_KEY) };
}
function paths() { const dir = join(process.cwd(), "data", "object-storage-probe"); return { dir, state: join(dir, "state.json"), lock: join(dir, "probe.lock") }; }
function load(): ProbeState | undefined {
  const path = paths().state;
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, "utf8")) as ProbeState;
  if (!value || typeof value.bucket !== "string" || !Number.isSafeInteger(value.attempts) || value.attempts < 1 || value.attempts > 3 || typeof value.lastAttempt !== "string") throw failure();
  return value;
}
function save(state: ProbeState) {
  const p = paths(), temporary = join(p.dir, `${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  renameSync(temporary, p.state);
}
export function getObjectStorageProbe(userId: string): ProbeResult {
  requirePlatformMaster(userId);
  const config = configuration();
  if (!config.ready) return { state: "disabled", attempts: 0 };
  const state = load();
  if (state && state.bucket !== config.bucket) throw failure();
  return { state: state?.verifiedAt ? "verified" : state?.attempts ? "pending" : "ready", attempts: state?.attempts ?? 0, ...(state?.verifiedAt ? { verifiedAt: state.verifiedAt } : {}) };
}
function createStore(userId: string): ProbeStore {
  return createMagaluInventoryObjectStore({ region: process.env.SST_OBJECT_REGION as "br-se1" | "br-ne1", bucket: process.env.SST_OBJECT_BUCKET!, accessKeyId: process.env.SST_OBJECT_ACCESS_KEY_ID!, secretAccessKey: process.env.SST_OBJECT_SECRET_ACCESS_KEY!, maxFileBytes: 100 * 1024 }, async (_action, resourceId) => {
    requirePlatformMaster(userId);
    if (resourceId !== "storage-probe") throw failure();
    return { tenantId: "platform-storage-test", actorId: userId, resourceId };
  });
}
/** Injeções exclusivas dos testes; a Server Action nunca recebe essas dependências do navegador. */
export async function runObjectStorageProbe(userId: string, dependencies: { createStore?: (userId: string) => ProbeStore; fetch?: typeof fetch } = {}): Promise<ProbeResult> {
  requirePlatformMaster(userId);
  const config = configuration();
  if (!config.ready) throw new Error("Armazenamento de teste desativado. Configure uma credencial apropriada no servidor antes de executar.");
  const p = paths(); mkdirSync(p.dir, { recursive: true });
  let descriptor: number;
  try { descriptor = openSync(p.lock, "wx", 0o600); } catch { throw new Error("Já existe uma verificação em andamento. Aguarde; se persistir, solicite revisão da trava."); }
  try {
    const old = load();
    if (old && old.bucket !== config.bucket) throw failure();
    if (old?.verifiedAt) return getObjectStorageProbe(userId);
    if ((old?.attempts ?? 0) >= 3) throw new Error("Limite de três tentativas atingido. Revise os arquivos e o histórico antes de liberar novos testes.");
    if (old && Date.now() - Date.parse(old.lastAttempt) < 60000) throw new Error("Aguarde um minuto antes de tentar novamente.");
    const state: ProbeState = { bucket: config.bucket, attempts: (old?.attempts ?? 0) + 1, lastAttempt: new Date().toISOString(), ...(old?.receipt ? { receipt: old.receipt } : {}) };
    save(state);
    appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.integration_run", targetId: "object-storage-probe-started" });
    try {
      const store = (dependencies.createStore ?? createStore)(userId);
      if (!state.receipt) {
        const pdf = await PDFDocument.create();
        pdf.addPage([200, 200]).drawText("CROQUI FICTICIO - TESTE", { x: 10, y: 100, size: 10 });
        state.receipt = await store.put("storage-probe", "application/pdf", await pdf.save());
        save(state);
      }
      const bytes = await store.get(state.receipt);
      if ((await PDFDocument.load(bytes)).getPageCount() !== 1) throw failure();
      const signed = new URL(await store.temporaryDownload(state.receipt, 60));
      const expectedHost = `${process.env.SST_OBJECT_REGION}.magaluobjects.com`;
      if (signed.protocol !== "https:" || signed.hostname !== expectedHost || signed.port || signed.username || signed.password) throw failure();
      const transport = dependencies.fetch ?? fetch;
      const response = await transport(signed, { redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.body) throw failure();
      const reader = response.body.getReader(); let size = 0; const hash = createHash("sha256");
      try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > state.receipt.size) throw failure(); hash.update(chunk.value); }
      } finally { await reader.cancel(); }
      if (size !== state.receipt.size || hash.digest("hex") !== state.receipt.sha256) throw failure();
      signed.search = "";
      const anonymous = await transport(signed, { redirect: "error", signal: AbortSignal.timeout(20000) });
      await anonymous.body?.cancel();
      if (anonymous.status !== 403) throw failure();
      appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.integration_run", targetId: "object-storage-probe-verified" });
      state.verifiedAt = new Date().toISOString(); save(state);
      return getObjectStorageProbe(userId);
    } catch {
      appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.integration_run", targetId: "object-storage-probe-failed" });
      throw failure();
    }
  } finally { closeSync(descriptor); unlinkSync(p.lock); }
}
