import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { TenantWriteContext } from "./tenant-write-operations.ts";

type JsonObject = Record<string, unknown>;
export type GateDecisionCommand = Readonly<{ scopeId: string; companyId: string; unitId: string; requirementSetId: string; fingerprint: string; notes: string; snapshot: JsonObject }>;
export type GateScheduleCommand = Readonly<{ decisionId: string; scheduledOn: string }>;

const id = (value: string, label: string) => {
  const result = value.trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(result)) throw new Error(`${label} inválido.`);
  return result;
};
const text = (value: string, label: string, max: number) => {
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${label} inválido.`);
  return result;
};
const day = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data de agendamento inválida.");
  const [year, month, date] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) throw new Error("Data de agendamento inválida.");
  return value;
};

function assertAdministrator(context: TenantWriteContext) {
  if (context.role !== "consultoria_admin") throw new Error("Ação exclusiva da administradora da consultoria.");
}
function stableFingerprint(value: JsonObject) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Candidato desconectado do runtime. A chamada deve ocorrer dentro de executeTenantWriteTransaction.
export async function recordIntegrationDecisionInTransaction(client: PoolClient, context: TenantWriteContext, command: GateDecisionCommand) {
  assertAdministrator(context);
  const scopeId = id(command.scopeId, "Escopo");
  const companyId = id(command.companyId, "Empresa");
  const unitId = id(command.unitId, "Unidade");
  const requirementSetId = id(command.requirementSetId, "Conjunto de requisitos");
  const notes = text(command.notes, "Justificativa", 1200);
  if (!/^[a-f0-9]{64}$/.test(command.fingerprint)) throw new Error("Estado do gate inválido.");
  if (!command.snapshot || Array.isArray(command.snapshot) || command.snapshot.scopeId !== scopeId || command.snapshot.fingerprint !== command.fingerprint) throw new Error("Snapshot da decisão inválido.");

  const requirement = await client.query<{ id: string }>(
    `SELECT id FROM sst.third_party_requirement_sets
     WHERE tenant_id = $1 AND id = $2 AND company_id = $3 AND unit_id = $4 AND status = 'active' FOR SHARE`,
    [context.tenantId, requirementSetId, companyId, unitId],
  );
  if (!requirement.rowCount) throw new Error("Conjunto de requisitos ativo indisponível para esta empresa e unidade.");

  const decisionId = randomUUID();
  const occurredAt = new Date().toISOString();
  await client.query(
    `INSERT INTO sst.third_party_integration_decisions
     (tenant_id,id,scope_id,company_id,unit_id,requirement_set_id,fingerprint,notes,decided_by,decided_role,decided_at,decision_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [context.tenantId, decisionId, scopeId, companyId, unitId, requirementSetId, command.fingerprint, notes, context.userId, context.role, occurredAt, JSON.stringify(command.snapshot)],
  );
  await client.query(
    `INSERT INTO sst.third_party_integration_audit
     (tenant_id,id,action,target_id,actor_user_id,actor_role,occurred_at)
     VALUES ($1,$2,'thirdparty.integration_approved',$3,$4,$5,$6)`,
    [context.tenantId, randomUUID(), decisionId, context.userId, context.role, occurredAt],
  );
  return { id: decisionId, fingerprint: command.fingerprint, occurredAt };
}

export async function recordIntegrationScheduleInTransaction(client: PoolClient, context: TenantWriteContext, command: GateScheduleCommand) {
  assertAdministrator(context);
  const decisionId = id(command.decisionId, "Decisão");
  const scheduledOn = day(command.scheduledOn);
  const decision = await client.query<{ id: string }>(
    "SELECT id FROM sst.third_party_integration_decisions WHERE tenant_id = $1 AND id = $2",
    [context.tenantId, decisionId],
  );
  if (!decision.rowCount) throw new Error("Decisão de integração indisponível.");
  const scheduleId = randomUUID();
  const occurredAt = new Date().toISOString();
  await client.query(
    `INSERT INTO sst.third_party_integration_schedules (tenant_id,id,decision_id,scheduled_on,created_by,created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`, [context.tenantId, scheduleId, decisionId, scheduledOn, context.userId, occurredAt],
  );
  await client.query(
    `INSERT INTO sst.third_party_integration_audit
     (tenant_id,id,action,target_id,actor_user_id,actor_role,occurred_at)
     VALUES ($1,$2,'thirdparty.integration_scheduled',$3,$4,$5,$6)`,
    [context.tenantId, randomUUID(), scheduleId, context.userId, context.role, occurredAt],
  );
  return { id: scheduleId, decisionId, scheduledOn, occurredAt };
}

export function fingerprintGateSnapshot(snapshot: JsonObject) {
  if (!snapshot || Array.isArray(snapshot)) throw new Error("Snapshot do gate inválido.");
  return stableFingerprint(snapshot);
}
