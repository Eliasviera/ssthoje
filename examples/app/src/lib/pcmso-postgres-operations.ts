import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PcmsoRecord, PcmsoScope, PcmsoSummary } from "./pcmso-store";
import { listRuntimeMemberships } from "./tenant-access";
import type { TenantWriteContext } from "./tenant-write-operations";

type PcmsoAction = "assigned" | "save" | "submit" | "review";
type PcmsoRow = Omit<PcmsoRecord, "revisions" | "history"> & { createdAt: string; updatedAt: string };
type PcmsoDbRow = {
  id: string; company_id: string; unit_id: string; company_name: string; unit_name: string;
  coordinator_id: string; status: PcmsoRecord["status"]; version: number;
  content: string; created_at: Date | string; updated_at: Date | string;
};

function summary(record: PcmsoRow): PcmsoSummary {
  return { id: record.id, companyId: record.companyId, unitId: record.unitId, companyName: record.companyName,
    unitName: record.unitName, coordinatorId: record.coordinatorId, status: record.status, version: record.version,
    createdAt: record.createdAt, updatedAt: record.updatedAt };
}

function fromRow(row: PcmsoDbRow, tenantId: string): PcmsoRow {
  return {
    id: row.id, tenantId, companyId: row.company_id, unitId: row.unit_id,
    companyName: row.company_name, unitName: row.unit_name, coordinatorId: row.coordinator_id,
    status: row.status, version: Number(row.version), content: row.content,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function appendHistory(client: PoolClient, tenantId: string, pcmsoId: string, actorUserId: string, action: PcmsoAction, occurredAt: string) {
  await client.query(
    `INSERT INTO sst.pcmso_history (id, tenant_id, pcmso_id, action, actor_user_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), tenantId, pcmsoId, action, actorUserId, occurredAt],
  );
}

function assertImportRecord(record: PcmsoRecord, tenantId: string) {
  if (record.tenantId !== tenantId || !record.id || record.id.length > 200 || !record.coordinatorId || record.coordinatorId.length > 200
    || !record.companyName?.trim() || record.companyName.length > 200 || !record.unitName?.trim() || record.unitName.length > 200
    || !["draft", "in_review", "reviewed"].includes(record.status) || !Number.isSafeInteger(record.version) || record.version < 0
    || typeof record.content !== "string" || record.content.length > 12000 || !Number.isFinite(Date.parse(record.createdAt))
    || !Number.isFinite(Date.parse(record.updatedAt)) || !Array.isArray(record.revisions) || !Array.isArray(record.history)
    || record.pgrRiskLink !== undefined) throw new Error("A origem PCMSO contém registro inválido ou vínculo não suportado; lote interrompido.");
  const revisionVersions = new Set<number>();
  for (const revision of record.revisions) {
    if (!Number.isSafeInteger(revision.version) || revision.version < 1 || revision.version > record.version
      || revisionVersions.has(revision.version) || typeof revision.content !== "string" || !revision.content.trim()
      || revision.content.length > 12000 || !revision.actorUserId || !Number.isFinite(Date.parse(revision.savedAt))) {
      throw new Error("Histórico de versões PCMSO inválido; lote interrompido.");
    }
    revisionVersions.add(revision.version);
  }
  if (revisionVersions.size !== record.version || (record.version > 0 && record.revisions.at(-1)?.content !== record.content)
    || (record.version === 0 && (record.status !== "draft" || record.content !== ""))) {
    throw new Error("Versões PCMSO incompletas ou divergentes do conteúdo atual.");
  }
  for (const event of record.history) {
    if (!["assigned", "save", "submit", "review"].includes(event.action) || !event.actorUserId || !Number.isFinite(Date.parse(event.occurredAt))) {
      throw new Error("Histórico de eventos PCMSO inválido; lote interrompido.");
    }
  }
}

export async function listPcmsoSummariesInTransaction(client: PoolClient, tenantId: string): Promise<PcmsoSummary[]> {
  const result = await client.query<PcmsoDbRow>(
    `SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at
     FROM sst.pcmso_records WHERE tenant_id = $1 ORDER BY updated_at DESC, id`, [tenantId],
  );
  return result.rows.map((row) => summary(fromRow(row, tenantId)));
}

export async function listAssignedPcmsoInTransaction(client: PoolClient, tenantId: string, coordinatorId: string): Promise<PcmsoRecord[]> {
  const result = await client.query<PcmsoDbRow>(
    `SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at
     FROM sst.pcmso_records WHERE tenant_id = $1 AND coordinator_id = $2 ORDER BY updated_at DESC, id`,
    [tenantId, coordinatorId],
  );
  const records: PcmsoRecord[] = [];
  for (const row of result.rows) {
    const base = fromRow(row, tenantId);
    const [revisions, history, linkSet] = await Promise.all([
      client.query<{ version: number; content: string; saved_at: Date | string; actor_user_id: string }>(
        `SELECT version, content, saved_at, actor_user_id FROM sst.pcmso_revisions
         WHERE tenant_id = $1 AND pcmso_id = $2 ORDER BY version`, [tenantId, row.id],
      ),
      client.query<{ action: PcmsoAction; actor_user_id: string; occurred_at: Date | string }>(
        `SELECT action, actor_user_id, occurred_at FROM sst.pcmso_history
         WHERE tenant_id = $1 AND pcmso_id = $2 ORDER BY occurred_at, id`, [tenantId, row.id],
      ),
      client.query<{ inventory_id: string; inventory_revision: string | number; version: number; medical_review_status: "pending" | "reviewed" }>(
        `SELECT inventory_id, inventory_revision, version, medical_review_status FROM sst.pcmso_pgr_link_sets
         WHERE tenant_id = $1 AND pcmso_id = $2`, [tenantId, row.id],
      ),
    ]);
    let pgrRiskLink: PcmsoRecord["pgrRiskLink"];
    if (linkSet.rows[0]) {
      const links = await client.query<{ risk_item_id: string }>(
        `SELECT risk_item_id FROM sst.pcmso_pgr_risk_links WHERE tenant_id = $1 AND pcmso_id = $2 ORDER BY position`,
        [tenantId, row.id],
      );
      pgrRiskLink = { inventoryId: linkSet.rows[0].inventory_id, inventoryRevision: Number(linkSet.rows[0].inventory_revision),
        version: Number(linkSet.rows[0].version), status: linkSet.rows[0].medical_review_status, riskItemIds: links.rows.map((link) => link.risk_item_id) };
    }
    records.push({ ...base,
      revisions: revisions.rows.map((revision) => ({ version: Number(revision.version), content: revision.content, savedAt: new Date(revision.saved_at).toISOString(), actorUserId: revision.actor_user_id })),
      history: history.rows.map((entry) => ({ action: entry.action, actorUserId: entry.actor_user_id, occurredAt: new Date(entry.occurred_at).toISOString() })),
      ...(pgrRiskLink ? { pgrRiskLink } : {}),
    });
  }
  return records;
}

export async function savePcmsoPgrRiskLinksInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  pcmsoId: string,
  expectedVersion: number,
  inventoryId: string,
  riskItemIds: string[],
): Promise<number> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !Array.isArray(riskItemIds)
    || riskItemIds.length === 0 || riskItemIds.length > 500 || new Set(riskItemIds).size !== riskItemIds.length
    || riskItemIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 64)) {
    throw new Error("Selecione ao menos um risco válido, sem duplicidades.");
  }
  const record = await client.query<{ company_id: string; unit_id: string; coordinator_id: string; status: string }>(
    `SELECT company_id, unit_id, coordinator_id, status FROM sst.pcmso_records
     WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.tenantId, pcmsoId],
  );
  const pcmso = record.rows[0];
  if (!pcmso || pcmso.coordinator_id !== context.userId) throw new Error("PCMSO indisponível para este coordenador.");
  if (pcmso.status === "reviewed") throw new Error("O PCMSO revisado está bloqueado. Reabra uma nova versão antes de alterar vínculos.");
  const inventory = await client.query<{ revision: string | number }>(
    `SELECT revision FROM sst.pgr_risk_inventories
     WHERE tenant_id = $1 AND id = $2 AND company_id = $3 AND unit_id = $4 AND status = 'approved' FOR SHARE`,
    [context.tenantId, inventoryId, pcmso.company_id, pcmso.unit_id],
  );
  if (!inventory.rows[0]) throw new Error("Selecione uma revisão aprovada do PGR para esta unidade.");
  const inventoryRevision = Number(inventory.rows[0].revision);
  const current = await client.query<{ version: number }>(
    `SELECT version FROM sst.pcmso_pgr_link_sets WHERE tenant_id = $1 AND pcmso_id = $2 FOR UPDATE`,
    [context.tenantId, pcmsoId],
  );
  const currentVersion = Number(current.rows[0]?.version ?? 0);
  if (currentVersion !== expectedVersion) throw new Error("O vínculo PGR mudou. Atualize a página antes de tentar novamente.");
  const risks = await client.query<{ id: string }>(
    `SELECT id FROM sst.pgr_risk_items WHERE tenant_id = $1 AND inventory_id = $2 AND active = true AND id = ANY($3::text[])
     ORDER BY id`, [context.tenantId, inventoryId, riskItemIds],
  );
  if (risks.rowCount !== riskItemIds.length) throw new Error("Um ou mais riscos não pertencem à revisão aprovada vigente.");
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO sst.pcmso_pgr_link_sets
     (tenant_id, pcmso_id, company_id, unit_id, inventory_id, inventory_revision, version, medical_review_status, reviewer_user_id, reviewed_at, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NULL, NULL, $8, $9)
     ON CONFLICT (tenant_id, pcmso_id) DO UPDATE SET inventory_id = EXCLUDED.inventory_id,
       inventory_revision = EXCLUDED.inventory_revision, version = EXCLUDED.version,
       medical_review_status = 'pending', reviewer_user_id = NULL, reviewed_at = NULL,
       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [context.tenantId, pcmsoId, pcmso.company_id, pcmso.unit_id, inventoryId, inventoryRevision, nextVersion, context.userId, now],
  );
  await client.query("DELETE FROM sst.pcmso_pgr_risk_links WHERE tenant_id = $1 AND pcmso_id = $2", [context.tenantId, pcmsoId]);
  for (const [position, riskItemId] of riskItemIds.entries()) {
    await client.query(
      `INSERT INTO sst.pcmso_pgr_risk_links (tenant_id, pcmso_id, inventory_id, risk_item_id, position)
       VALUES ($1, $2, $3, $4, $5)`, [context.tenantId, pcmsoId, inventoryId, riskItemId, position],
    );
  }
  const snapshot = { inventoryId, inventoryRevision, riskItemIds, medicalReview: { status: "pending" } };
  await client.query(
    `INSERT INTO sst.pcmso_pgr_link_history (id, tenant_id, pcmso_id, action, version, actor_user_id, occurred_at, snapshot)
     VALUES ($1, $2, $3, 'saved', $4, $5, $6, $7::jsonb)`,
    [randomUUID(), context.tenantId, pcmsoId, nextVersion, context.userId, now, JSON.stringify(snapshot)],
  );
  return nextVersion;
}

export async function reviewPcmsoPgrRiskLinksInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  pcmsoId: string,
  expectedVersion: number,
): Promise<number> {
  const link = await client.query<{ version: number; inventory_id: string; inventory_revision: string | number; medical_review_status: string }>(
    `SELECT l.version, l.inventory_id, l.inventory_revision, l.medical_review_status
     FROM sst.pcmso_pgr_link_sets l JOIN sst.pcmso_records p
       ON p.tenant_id = l.tenant_id AND p.id = l.pcmso_id
     WHERE l.tenant_id = $1 AND l.pcmso_id = $2 AND p.coordinator_id = $3 FOR UPDATE OF l`,
    [context.tenantId, pcmsoId, context.userId],
  );
  const current = link.rows[0];
  if (!current) throw new Error("Vínculo PGR-PCMSO indisponível para este coordenador.");
  if (Number(current.version) !== expectedVersion) throw new Error("O vínculo PGR mudou. Atualize a página antes de tentar novamente.");
  if (current.medical_review_status !== "pending") throw new Error("Este vínculo já foi revisado; salve uma nova versão para revisar novamente.");
  const inventory = await client.query(
    `SELECT 1 FROM sst.pgr_risk_inventories WHERE tenant_id = $1 AND id = $2 AND revision = $3 AND status = 'approved' FOR SHARE`,
    [context.tenantId, current.inventory_id, current.inventory_revision],
  );
  const links = await client.query<{ risk_item_id: string }>(
    `SELECT risk_item_id FROM sst.pcmso_pgr_risk_links WHERE tenant_id = $1 AND pcmso_id = $2 ORDER BY position`,
    [context.tenantId, pcmsoId],
  );
  if (!inventory.rowCount || !links.rowCount) throw new Error("A revisão aprovada ou a seleção de riscos mudou; atualize o vínculo antes da revisão.");
  const now = new Date().toISOString();
  const nextVersion = Number(current.version) + 1;
  await client.query(
    `UPDATE sst.pcmso_pgr_link_sets SET version = $3, medical_review_status = 'reviewed',
       reviewer_user_id = $4, reviewed_at = $5, updated_by = $4, updated_at = $5
     WHERE tenant_id = $1 AND pcmso_id = $2`, [context.tenantId, pcmsoId, nextVersion, context.userId, now],
  );
  await client.query(
    `INSERT INTO sst.pcmso_pgr_link_history (id, tenant_id, pcmso_id, action, version, actor_user_id, occurred_at, snapshot)
     VALUES ($1, $2, $3, 'reviewed', $4, $5, $6, $7::jsonb)`,
    [randomUUID(), context.tenantId, pcmsoId, nextVersion, context.userId, now,
      JSON.stringify({ inventoryId: current.inventory_id, inventoryRevision: Number(current.inventory_revision), riskItemIds: links.rows.map((item) => item.risk_item_id), medicalReview: { status: "reviewed", reviewerUserId: context.userId, reviewedAt: now } })],
  );
  return nextVersion;
}

export async function listMedicalUnitScopesInTransaction(client: PoolClient, tenantId: string, coordinatorId: string): Promise<PcmsoScope[]> {
  const result = await client.query<{ company_id: string; unit_id: string; company_name: string; unit_name: string }>(
    `SELECT company_id, unit_id, company_name, unit_name FROM sst.pcmso_records
     WHERE tenant_id = $1 AND coordinator_id = $2 ORDER BY company_id, unit_id`, [tenantId, coordinatorId],
  );
  return result.rows.map((row) => ({ companyId: row.company_id, unitId: row.unit_id, companyName: row.company_name, unitName: row.unit_name }));
}

export async function assignPcmsoInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  scope: PcmsoScope,
  coordinatorId: string,
): Promise<PcmsoSummary> {
  const coordinator = listRuntimeMemberships().find((member) => member.userId === coordinatorId && member.tenantId === context.tenantId
    && member.status === "active" && member.role === "medico_coordenador");
  if (!coordinator) throw new Error("Selecione um coordenador médico desta consultoria.");
  const unit = await client.query(
    `SELECT 1 FROM sst.client_companies c JOIN sst.client_units u
       ON u.tenant_id = c.tenant_id AND u.company_id = c.id
     WHERE c.tenant_id = $1 AND c.id = $2 AND c.status = 'active' AND u.id = $3`,
    [context.tenantId, scope.companyId, scope.unitId],
  );
  if (!unit.rowCount) throw new Error("Selecione uma empresa e unidade ativas desta consultoria.");

  const selected = await client.query<PcmsoDbRow>(
    `SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at
     FROM sst.pcmso_records WHERE tenant_id = $1 AND company_id = $2 AND unit_id = $3 FOR UPDATE`,
    [context.tenantId, scope.companyId, scope.unitId],
  );
  const now = new Date().toISOString();
  let record: PcmsoRow;
  if (selected.rows[0]) {
    const current = fromRow(selected.rows[0], context.tenantId);
    const updated = await client.query<PcmsoDbRow>(
      `UPDATE sst.pcmso_records SET coordinator_id = $3, updated_at = $4
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at`,
      [context.tenantId, current.id, coordinatorId, now],
    );
    record = fromRow(updated.rows[0], context.tenantId);
  } else {
    const inserted = await client.query<PcmsoDbRow>(
      `INSERT INTO sst.pcmso_records
       (tenant_id, id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 0, '', $8, $8)
       RETURNING id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at`,
      [context.tenantId, randomUUID(), scope.companyId, scope.unitId, scope.companyName, scope.unitName, coordinatorId, now],
    );
    record = fromRow(inserted.rows[0], context.tenantId);
  }
  await appendHistory(client, context.tenantId, record.id, context.userId, "assigned", now);
  return summary(record);
}

export async function changePcmsoInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  id: string,
  expectedVersion: number,
  operation: "save" | "submit" | "review",
  content?: string,
): Promise<void> {
  const selected = await client.query<PcmsoDbRow>(
    `SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at
     FROM sst.pcmso_records WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.tenantId, id],
  );
  const row = selected.rows[0];
  if (!row || row.coordinator_id !== context.userId) throw new Error("PCMSO indisponível para este coordenador.");
  if (Number(row.version) !== expectedVersion) throw new Error("O documento mudou. Atualize a página antes de tentar novamente.");
  const now = new Date().toISOString();
  if (operation === "save") {
    if (row.status !== "draft") throw new Error("Somente rascunhos podem ser editados.");
    if (typeof content !== "string" || !content.trim() || content.length > 12000) throw new Error("Informe conteúdo fictício entre 1 e 12.000 caracteres.");
    const version = expectedVersion + 1;
    await client.query("UPDATE sst.pcmso_records SET content = $3, version = $4, updated_at = $5 WHERE tenant_id = $1 AND id = $2", [context.tenantId, id, content.trim(), version, now]);
    await client.query("INSERT INTO sst.pcmso_revisions (tenant_id, pcmso_id, version, content, saved_at, actor_user_id) VALUES ($1, $2, $3, $4, $5, $6)", [context.tenantId, id, version, content.trim(), now, context.userId]);
  } else if (operation === "submit") {
    if (row.status !== "draft" || expectedVersion < 1) throw new Error("Salve um rascunho antes de enviar para revisão.");
    await client.query("UPDATE sst.pcmso_records SET status = 'in_review', version = version + 1, updated_at = $3 WHERE tenant_id = $1 AND id = $2", [context.tenantId, id, now]);
  } else {
    if (row.status !== "in_review") throw new Error("Envie o documento para revisão primeiro.");
    await client.query("UPDATE sst.pcmso_records SET status = 'reviewed', version = version + 1, updated_at = $3 WHERE tenant_id = $1 AND id = $2", [context.tenantId, id, now]);
  }
  await appendHistory(client, context.tenantId, id, context.userId, operation, now);
}

export async function importPcmsoTenantBatchInTransaction(client: PoolClient, tenantId: string, records: PcmsoRecord[]): Promise<"imported" | "already_imported"> {
  if (!tenantId || records.some((record) => record.tenantId !== tenantId)) throw new Error("A importação PCMSO excedeu o escopo da consultoria.");
  const tx = await client.query<{ tenant_id: string | null; read_only: boolean }>(
    "SELECT current_setting('sst.tenant_id', true) AS tenant_id, current_setting('transaction_read_only')::boolean AS read_only",
  );
  if (tx.rows[0]?.tenant_id !== tenantId || tx.rows[0]?.read_only !== false) throw new Error("A importação PCMSO exige transação de escrita no tenant selecionado.");
  const selected = await client.query<PcmsoDbRow>(
    `SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at
     FROM sst.pcmso_records WHERE tenant_id = $1 FOR UPDATE`, [tenantId],
  );
  if (new Set(records.map((record) => record.id)).size !== records.length
    || new Set(records.map((record) => `${record.companyId}\u0000${record.unitId}`)).size !== records.length) {
    throw new Error("A origem PCMSO contém registros ou escopos repetidos.");
  }
  for (const record of records) assertImportRecord(record, tenantId);

  if (selected.rowCount) {
    const revisionRows = await client.query<{ pcmso_id: string; version: number; content: string; saved_at: Date | string; actor_user_id: string }>(
      "SELECT pcmso_id, version, content, saved_at, actor_user_id FROM sst.pcmso_revisions WHERE tenant_id = $1 ORDER BY pcmso_id, version", [tenantId],
    );
    const historyRows = await client.query<{ pcmso_id: string; action: PcmsoAction; actor_user_id: string; occurred_at: Date | string }>(
      "SELECT pcmso_id, action, actor_user_id, occurred_at FROM sst.pcmso_history WHERE tenant_id = $1", [tenantId],
    );
    const linkCounts = await client.query<{ count: number }>(
      `SELECT ((SELECT count(*) FROM sst.pcmso_pgr_link_sets WHERE tenant_id = $1)
          + (SELECT count(*) FROM sst.pcmso_pgr_risk_links WHERE tenant_id = $1)
          + (SELECT count(*) FROM sst.pcmso_pgr_link_history WHERE tenant_id = $1))::integer AS count`, [tenantId],
    );
    const rowsById = new Map(selected.rows.map((row) => [row.id, row]));
    const matchedRecords = records.every((record) => {
      const row = rowsById.get(record.id);
      return row && row.company_id === record.companyId && row.unit_id === record.unitId && row.company_name === record.companyName
        && row.unit_name === record.unitName && row.coordinator_id === record.coordinatorId && row.status === record.status
        && Number(row.version) === record.version && row.content === record.content
        && new Date(row.created_at).toISOString() === new Date(record.createdAt).toISOString()
        && new Date(row.updated_at).toISOString() === new Date(record.updatedAt).toISOString();
    });
    const matchedRevisions = records.every((record) => record.revisions.every((revision) => {
      const row = revisionRows.rows.find((entry) => entry.pcmso_id === record.id && Number(entry.version) === revision.version);
      return row && row.content === revision.content && row.actor_user_id === revision.actorUserId
        && new Date(row.saved_at).toISOString() === new Date(revision.savedAt).toISOString();
    }));
    const expectedHistory = records.flatMap((record) => record.history.map((event) =>
      `${record.id}\u0000${event.action}\u0000${event.actorUserId}\u0000${new Date(event.occurredAt).toISOString()}`)).sort();
    const actualHistory = historyRows.rows.map((event) =>
      `${event.pcmso_id}\u0000${event.action}\u0000${event.actor_user_id}\u0000${new Date(event.occurred_at).toISOString()}`).sort();
    if (selected.rowCount === records.length && revisionRows.rowCount === records.reduce((sum, record) => sum + record.revisions.length, 0)
      && historyRows.rowCount === expectedHistory.length && matchedRecords && matchedRevisions
      && JSON.stringify(actualHistory) === JSON.stringify(expectedHistory) && Number(linkCounts.rows[0]?.count ?? 0) === 0) {
      return "already_imported";
    }
    throw new Error("Destino PCMSO não está vazio ou reconciliado; importação interrompida.");
  }

  for (const record of records) {
    await client.query(
      `INSERT INTO sst.pcmso_records
       (tenant_id, id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [tenantId, record.id, record.companyId, record.unitId, record.companyName, record.unitName, record.coordinatorId,
        record.status, record.version, record.content, record.createdAt, record.updatedAt],
    );
    for (const revision of record.revisions) {
      await client.query("INSERT INTO sst.pcmso_revisions (tenant_id, pcmso_id, version, content, saved_at, actor_user_id) VALUES ($1, $2, $3, $4, $5, $6)", [tenantId, record.id, revision.version, revision.content, revision.savedAt, revision.actorUserId]);
    }
    for (const event of record.history) {
      await appendHistory(client, tenantId, record.id, event.actorUserId, event.action as PcmsoAction, event.occurredAt);
    }
  }
  return "imported";
}
