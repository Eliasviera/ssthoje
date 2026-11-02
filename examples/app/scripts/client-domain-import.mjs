import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { DEMO_MEMBERSHIPS, DEMO_TENANTS } from "../src/lib/tenant-access.ts";
import { getTenantSettings } from "../src/lib/tenant-state.ts";
import { loadAdminPostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const dataDir = join(process.cwd(), "data");
const actions = new Set(["client.created", "client.updated", "client.status_changed"]);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("data inválida no snapshot");
  return date.toISOString();
}

function parseClients(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("clients.json deve conter empresas");
  const ids = new Set();
  const unitIds = new Set();
  const tenantIds = new Set();
  const companyUnits = new Map();
  const companies = [];
  const units = [];
  for (const company of value) {
    if (!company || typeof company !== "object" || Array.isArray(company)
      || typeof company.id !== "string" || !company.id.trim() || company.id.length > 200
      || ids.has(company.id)
      || typeof company.tenantId !== "string" || !company.tenantId.trim()
      || typeof company.legalName !== "string" || !company.legalName.trim() || company.legalName.length > 160
      || typeof company.tradeName !== "string" || company.tradeName.length > 120
      || typeof company.contactName !== "string" || company.contactName.length > 120
      || typeof company.contactEmail !== "string" || company.contactEmail.length > 254
      || typeof company.contactPhone !== "string" || company.contactPhone.length > 30
      || !["active", "archived"].includes(company.status)
      || !Array.isArray(company.units) || !company.units.length
      || company.units.length > 20) throw new Error("empresa não corresponde ao contrato do banco");
    ids.add(company.id);
    tenantIds.add(company.tenantId);
    const companyUnitIds = new Set();
    companies.push({
      tenant_id: company.tenantId,
      id: company.id,
      legal_name: company.legalName,
      trade_name: company.tradeName,
      contact_name: company.contactName,
      contact_email: company.contactEmail,
      contact_phone: company.contactPhone,
      status: company.status,
      created_at: normalizedDate(company.createdAt),
      updated_at: normalizedDate(company.updatedAt),
    });
    for (const unit of company.units) {
      if (!unit || typeof unit !== "object" || Array.isArray(unit)
        || typeof unit.id !== "string" || !unit.id.trim() || unit.id.length > 200
        || unitIds.has(unit.id)
        || typeof unit.cnpj !== "string" || unit.cnpj.length > 32
        || unit.cnpj.replace(/\D/g, "").length !== 14
        || typeof unit.name !== "string" || !unit.name.trim() || unit.name.length > 120
        || typeof unit.cityState !== "string" || unit.cityState.length > 120) {
        throw new Error("unidade não corresponde ao contrato do banco");
      }
      unitIds.add(unit.id);
      companyUnitIds.add(unit.id);
      units.push({ tenant_id: company.tenantId, id: unit.id, company_id: company.id,
        cnpj: unit.cnpj, name: unit.name, city_state: unit.cityState });
    }
    companyUnits.set(company.id, companyUnitIds);
  }
  if (tenantIds.size !== 1) throw new Error("o snapshot deve pertencer a exatamente um tenant");
  return { companies, units, tenantId: [...tenantIds][0], companyUnits };
}

function parseAudit(text, tenantId) {
  const seen = new Set();
  const events = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error(`audit-log.jsonl inválido na linha ${index + 1}`); }
    if (typeof event?.action !== "string" || !event.action.startsWith("client.")) continue;
    if (!actions.has(event.action) || event.tenantId !== tenantId
      || typeof event.id !== "string" || !event.id.trim() || event.id.length > 200 || seen.has(event.id)
      || typeof event.actorUserId !== "string" || !event.actorUserId.trim() || event.actorUserId.length > 200
      || typeof event.actorRole !== "string" || !event.actorRole.trim() || event.actorRole.length > 80) {
      throw new Error("evento client.* não corresponde ao contrato do banco");
    }
    seen.add(event.id);
    events.push({ id: event.id, tenant_id: event.tenantId, actor_user_id: event.actorUserId,
      actor_role: event.actorRole, action: event.action,
      target_id: typeof event.targetId === "string" && event.targetId.trim() ? event.targetId : null,
      occurred_at: normalizedDate(event.occurredAt) });
  }
  return events;
}

async function loadSnapshot() {
  const [clientsRaw, workersRaw, auditRaw] = await Promise.all([
    readFile(join(dataDir, "clients.json")),
    readFile(join(dataDir, "workers.json")),
    readFile(join(dataDir, "audit-log.jsonl")),
  ]);
  const source = parseClients(JSON.parse(clientsRaw.toString("utf8")));
  const workers = JSON.parse(workersRaw.toString("utf8"));
  if (!Array.isArray(workers)) throw new Error("workers.json deve conter uma lista");
  for (const worker of workers) {
    if (!worker || worker.tenantId !== source.tenantId
      || !source.companyUnits.get(worker.companyId)?.has(worker.unitId)) {
      throw new Error("referência de trabalhador não corresponde ao snapshot de empresas/unidades");
    }
  }
  const tenant = DEMO_TENANTS.find((item) => item.id === source.tenantId);
  if (!tenant) throw new Error("tenant da origem não está no registry de demonstração");
  const memberships = DEMO_MEMBERSHIPS.filter((item) => item.tenantId === source.tenantId).map((item) => ({
    tenant_id: item.tenantId, user_id: item.userId, role: item.role,
    status: item.status, display_name: item.displayName,
  }));
  if (!memberships.length) throw new Error("tenant da origem não possui memberships no registry de demonstração");
  const tenantRow = { id: tenant.id, name: tenant.name, status: getTenantSettings(tenant.id).status };
  const events = parseAudit(auditRaw.toString("utf8"), source.tenantId);
  return {
    tenant: tenantRow, memberships, companies: source.companies, units: source.units, events,
    hashes: { clients: digest(clientsRaw), workers: digest(workersRaw), audit: digest(auditRaw) },
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function isoRow(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, field.endsWith("_at") ? normalizedDate(row[field]) : row[field]]));
}

function sameRows(actual, expected, fields, sortKey) {
  const normalize = (rows) => rows.map((row) => isoRow(row, fields)).sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
  return stable(normalize(actual)) === stable(normalize(expected));
}

async function inspectTarget(client, source) {
  const tenant = await client.query("SELECT id, name, status FROM sst.tenants WHERE id = $1", [source.tenant.id]);
  const memberships = await client.query(
    "SELECT tenant_id, user_id, role, status, display_name FROM sst.tenant_memberships WHERE tenant_id = $1 ORDER BY user_id",
    [source.tenant.id],
  );
  const companies = await client.query(
    `SELECT tenant_id, id, legal_name, trade_name, contact_name, contact_email, contact_phone, status, created_at, updated_at
     FROM sst.client_companies WHERE tenant_id = $1 ORDER BY id`, [source.tenant.id]);
  const units = await client.query(
    `SELECT tenant_id, id, company_id, cnpj, name, city_state
     FROM sst.client_units WHERE tenant_id = $1 ORDER BY id`, [source.tenant.id]);
  const events = await client.query(
    `SELECT id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at
     FROM sst.client_audit_history WHERE tenant_id = $1 ORDER BY id`, [source.tenant.id]);

  const tenantMatches = tenant.rowCount === 0 || stable(tenant.rows[0]) === stable(source.tenant);
  const membershipsMatch = memberships.rows.every((actual) => source.memberships.some((expected) => stable(actual) === stable(expected)));
  const membershipsComplete = source.memberships.every((expected) => memberships.rows.some((actual) => stable(actual) === stable(expected)));
  const companiesMatch = companies.rowCount === 0 || sameRows(companies.rows, source.companies,
    ["tenant_id", "id", "legal_name", "trade_name", "contact_name", "contact_email", "contact_phone", "status", "created_at", "updated_at"], "id");
  const unitsMatch = units.rowCount === 0 || sameRows(units.rows, source.units,
    ["tenant_id", "id", "company_id", "cnpj", "name", "city_state"], "id");
  const eventsMatch = events.rowCount === 0 || sameRows(events.rows, source.events,
    ["id", "tenant_id", "actor_user_id", "actor_role", "action", "target_id", "occurred_at"], "id");
  const ready = tenantMatches && membershipsMatch && companiesMatch && unitsMatch && eventsMatch;
  return { ready, alreadyReconciled: tenant.rowCount === 1 && membershipsComplete
    && companies.rowCount === source.companies.length && units.rowCount === source.units.length
    && events.rowCount === source.events.length, tenantPresent: tenant.rowCount === 1,
    membershipCount: memberships.rowCount, companyCount: companies.rowCount,
    unitCount: units.rowCount, eventCount: events.rowCount };
}

async function importSnapshot(client, source) {
  await client.query(
    "INSERT INTO sst.tenants (id, name, status) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
    [source.tenant.id, source.tenant.name, source.tenant.status],
  );
  for (const membership of source.memberships) {
    await client.query(
      `INSERT INTO sst.tenant_memberships (tenant_id, user_id, role, status, display_name)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [membership.tenant_id, membership.user_id, membership.role, membership.status, membership.display_name],
    );
  }
  for (const company of source.companies) {
    await client.query(
      `INSERT INTO sst.client_companies
       (tenant_id, id, legal_name, trade_name, contact_name, contact_email, contact_phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (tenant_id, id) DO NOTHING`,
      [company.tenant_id, company.id, company.legal_name, company.trade_name, company.contact_name,
        company.contact_email, company.contact_phone, company.status, company.created_at, company.updated_at],
    );
  }
  for (const unit of source.units) {
    await client.query(
      `INSERT INTO sst.client_units (tenant_id, id, company_id, cnpj, name, city_state)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, id) DO NOTHING`,
      [unit.tenant_id, unit.id, unit.company_id, unit.cnpj, unit.name, unit.city_state],
    );
  }
  for (const event of source.events) {
    await client.query(
      `INSERT INTO sst.client_audit_history
       (id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.tenant_id, event.actor_user_id, event.actor_role, event.action, event.target_id, event.occurred_at],
    );
  }
}

const pool = new Pool(loadAdminPostgresConfig());
let client;
let transactionOpen = false;
try {
  const source = await loadSnapshot();
  client = await pool.connect();
  const apply = process.argv.includes("--apply");
  await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  transactionOpen = true;
  if (apply) await client.query("SELECT pg_advisory_xact_lock(22025, 1)");
  const before = await inspectTarget(client, source);
  assert.ok(before.ready, "o banco contém conflitos ou importação parcial; nada foi alterado");

  if (apply && !before.alreadyReconciled) {
    await importSnapshot(client, source);
    const after = await inspectTarget(client, source);
    assert.ok(after.alreadyReconciled, "a conferência pós-escrita divergiu do snapshot; transação revertida");
  }
  await client.query("COMMIT");
  transactionOpen = false;
  console.log(apply ? "Importação Empresas/Unidades reconciliada em transação." : "Dry-run Empresas/Unidades: origem válida e destino compatível; nenhuma gravação feita.");
  console.log(`Plano: empresas=${source.companies.length}, unidades=${source.units.length}, eventos client.*=${source.events.length}, memberships=${source.memberships.length}.`);
  console.log(`Destino antes: tenant=${before.tenantPresent ? "presente" : "ausente"}, memberships=${before.membershipCount}, empresas=${before.companyCount}, unidades=${before.unitCount}, eventos=${before.eventCount}; já reconciliado=${before.alreadyReconciled}.`);
  console.log(`SHA-256: clients.json=${source.hashes.clients}; workers.json=${source.hashes.workers}; audit-log.jsonl=${source.hashes.audit}.`);
  console.log("Nenhum nome, CNPJ, contato, identificador ou dado pessoal foi exibido.");
  if (!apply) console.log("Para gravar, é necessária autorização explícita e execução com --apply.");
} catch (error) {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  console.error(error instanceof Error ? error.message : "Importação interrompida; transação revertida.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
