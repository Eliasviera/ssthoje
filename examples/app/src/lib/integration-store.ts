import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MOCK_ADAPTERS, signFixture, verifyFixture, type IntegrationKind, type SandboxResult } from "./integration-adapters.ts";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { listRuntimeTenants } from "./tenant-access.ts";
import { getTenantSettings } from "./tenant-state.ts";
import { appendAuditEvent } from "./audit-log.ts";

export type Scenario = "success" | "duplicate" | "invalid_signature" | "failure";
type Run = { id: string; tenantId: string; kind: IntegrationKind; key: string; scenario: Scenario; state: "completed" | "rejected" | "failed"; occurredAt: string; actorUserId: string; reason: string; result?: SandboxResult; events: { id: string; state: "accepted" | "duplicate" | "rejected" | "failed"; description: string }[] };
const localFixtureSecret = randomBytes(32).toString("hex");
function read(): Run[] {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "integration-sandbox.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
function write(runs: Run[]) {
  const path = join(process.cwd(), "data", "integration-sandbox.json"); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(runs, null, 2), { flag: "wx" }); renameSync(temp, path);
}
function audit(userId: string, action: "platform.integration_read" | "platform.integration_run", targetId?: string) { appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action, targetId }); }
export function getIntegrationSandbox(userId: string) { requirePlatformMaster(userId); audit(userId, "platform.integration_read"); return structuredClone(read().slice(-30).reverse()); }
export function runIntegrationSandbox(userId: string, tenantId: string, kind: IntegrationKind, scenario: Scenario, key: string, reason: string) {
  requirePlatformMaster(userId); throttle(userId);
  if (!listRuntimeTenants().some(t => t.id === tenantId) || getTenantSettings(tenantId).status !== "active") throw new Error("Selecione uma consultoria ativa de demonstração.");
  if (!Object.hasOwn(MOCK_ADAPTERS, kind) || !["success", "duplicate", "invalid_signature", "failure"].includes(scenario) || typeof key !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(key) || typeof reason !== "string" || !reason.trim() || reason.length > 600) throw new Error("Confira a integração, o cenário e a justificativa fictícia.");
  const runs = read(), old = runs.find(r => r.tenantId === tenantId && r.kind === kind && r.key === key);
  if (old) { if (old.scenario !== scenario) throw new Error("Esta chave já identifica outro cenário. Atualize a página."); return { id: old.id, repeated: true }; }
  const run: Run = { id: randomUUID(), tenantId, kind, key, scenario, state: "completed", occurredAt: new Date().toISOString(), actorUserId: userId, reason: reason.trim(), events: [] };
  const eventId = randomUUID();
  if (scenario === "failure") {
    run.state = "failed"; run.events.push({ id: eventId, state: "failed", description: "Falha de transporte simulada. Nenhum efeito externo; sem repetição automática." });
  } else {
    const body = JSON.stringify({ id: eventId, tenantId, kind, key, state: "simulated" });
    const signature = scenario === "invalid_signature" ? "0".repeat(64) : signFixture(body, localFixtureSecret);
    const seen = new Set<string>();
    const receive = () => {
      if (!verifyFixture(body, signature, localFixtureSecret)) { run.state = "rejected"; run.events.push({ id: eventId, state: "rejected", description: "Assinatura da fixture inválida. Evento recusado antes do processamento." }); return; }
      if (seen.has(eventId)) { run.events.push({ id: eventId, state: "duplicate", description: "Mesmo evento recebido novamente; nenhum processamento adicional." }); return; }
      seen.add(eventId); run.result = MOCK_ADAPTERS[kind].execute({ tenantId, kind, key });
      run.events.push({ id: eventId, state: "accepted", description: "Fixture assinada validada e processada uma vez." });
    };
    receive(); if (scenario === "duplicate") receive();
  }
  runs.push(run); write(runs); audit(userId, "platform.integration_run", run.id);
  return { id: run.id, repeated: false };
}
