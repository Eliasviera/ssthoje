import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ClientCompany, ClientUnit, NewClientCompany } from "./client-store.ts";
import { assertTenantCapacity } from "./tenant-state.ts";
import type { TenantWriteContext } from "./tenant-write-operations.ts";

type CompanyRow = {
  id: string;
  tenant_id: string;
  legal_name: string;
  trade_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: ClientCompany["status"];
  created_at: Date | string;
  updated_at: Date | string;
};
type UnitRow = { id: string; cnpj: string; name: string; city_state: string };

function iso(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Data de empresa inválida no PostgreSQL.");
  return date.toISOString();
}

function unitFromRow(row: UnitRow): ClientUnit {
  return { id: row.id, cnpj: row.cnpj, name: row.name, cityState: row.city_state };
}

function companyFromRow(row: CompanyRow, units: ClientUnit[]): ClientCompany {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    units,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function validateInput(input: NewClientCompany) {
  if (!input || typeof input !== "object"
    || typeof input.tenantId !== "string" || !input.tenantId.trim()
    || typeof input.legalName !== "string" || !input.legalName.trim() || input.legalName.length > 160
    || typeof input.tradeName !== "string" || input.tradeName.length > 120
    || typeof input.contactName !== "string" || input.contactName.length > 120
    || typeof input.contactEmail !== "string" || input.contactEmail.length > 254
    || typeof input.contactPhone !== "string" || input.contactPhone.length > 30
    || !Array.isArray(input.units) || input.units.length < 1 || input.units.length > 20) {
    throw new Error("Confira os dados da empresa antes de salvar.");
  }
  const cnpjs = new Set<string>();
  for (const unit of input.units) {
    if (!unit || typeof unit.cnpj !== "string" || !/^\d{14}$/.test(unit.cnpj)
      || typeof unit.name !== "string" || !unit.name.trim() || unit.name.length > 120
      || typeof unit.cityState !== "string" || unit.cityState.length > 120) {
      throw new Error("Confira os dados das unidades antes de salvar.");
    }
    if (cnpjs.has(unit.cnpj)) throw new Error("Não repita CNPJs no cadastro.");
    cnpjs.add(unit.cnpj);
  }
  return [...cnpjs];
}

async function lockTenant(client: PoolClient, tenantId: string) {
  await client.query("SELECT pg_advisory_xact_lock(22024, hashtext($1))", [tenantId]);
}

async function requireProvisionedTenant(client: PoolClient, tenantId: string) {
  const result = await client.query("SELECT id FROM sst.tenants WHERE id = $1", [tenantId]);
  if (!result.rowCount) throw new Error("A consultoria ainda não foi reconciliada no PostgreSQL.");
}

async function listUnits(client: PoolClient, tenantId: string, companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, ClientUnit[]>();
  const result = await client.query<UnitRow & { company_id: string }>(
    `SELECT id, company_id, cnpj, name, city_state
     FROM sst.client_units WHERE tenant_id = $1 AND company_id = ANY($2::text[])
     ORDER BY name, id`,
    [tenantId, companyIds],
  );
  const grouped = new Map<string, ClientUnit[]>();
  for (const row of result.rows) {
    const units = grouped.get(row.company_id) ?? [];
    units.push(unitFromRow(row));
    grouped.set(row.company_id, units);
  }
  return grouped;
}

export async function listClientCompaniesInTransaction(client: PoolClient, tenantId: string): Promise<ClientCompany[]> {
  const companies = await client.query<CompanyRow>(
    `SELECT id, tenant_id, legal_name, trade_name, contact_name, contact_email,
            contact_phone, status, created_at, updated_at
     FROM sst.client_companies WHERE tenant_id = $1 ORDER BY created_at DESC, id`,
    [tenantId],
  );
  const units = await listUnits(client, tenantId, companies.rows.map((row) => row.id));
  return companies.rows.map((row) => companyFromRow(row, units.get(row.id) ?? []));
}

async function appendClientAudit(client: PoolClient, context: TenantWriteContext, action: "client.created" | "client.status_changed", targetId: string) {
  await client.query(
    `INSERT INTO sst.client_audit_history
     (id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())`,
    [randomUUID(), context.tenantId, context.userId, context.role, action, targetId],
  );
}

async function activeCompanyCount(client: PoolClient, tenantId: string) {
  const result = await client.query<{ count: number | string }>(
    "SELECT count(*)::int AS count FROM sst.client_companies WHERE tenant_id = $1 AND status = 'active'",
    [tenantId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function createClientCompanyInTransaction(client: PoolClient, context: TenantWriteContext, input: NewClientCompany): Promise<ClientCompany> {
  const cnpjs = validateInput(input);
  if (input.tenantId !== context.tenantId) throw new Error("Acesso ao tenant negado.");
  await lockTenant(client, context.tenantId);
  await requireProvisionedTenant(client, context.tenantId);
  assertTenantCapacity(context.tenantId, "companies", await activeCompanyCount(client, context.tenantId));
  const duplicates = await client.query<{ cnpj_normalized: string }>(
    `SELECT cnpj_normalized FROM sst.client_units
     WHERE tenant_id = $1 AND cnpj_normalized = ANY($2::text[])`,
    [context.tenantId, cnpjs],
  );
  if (duplicates.rowCount) throw new Error("Este CNPJ já está cadastrado nesta consultoria.");

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const inserted = await client.query<CompanyRow>(
    `INSERT INTO sst.client_companies
     (tenant_id, id, legal_name, trade_name, contact_name, contact_email,
      contact_phone, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $8)
     RETURNING id, tenant_id, legal_name, trade_name, contact_name, contact_email,
               contact_phone, status, created_at, updated_at`,
    [context.tenantId, id, input.legalName.trim(), input.tradeName.trim(), input.contactName.trim(),
      input.contactEmail.trim().toLowerCase(), input.contactPhone.trim(), createdAt],
  );
  const units: ClientUnit[] = [];
  for (const unit of input.units) {
    const unitId = randomUUID();
    await client.query(
      `INSERT INTO sst.client_units (tenant_id, id, company_id, cnpj, name, city_state)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [context.tenantId, unitId, id, unit.cnpj, unit.name.trim(), unit.cityState.trim()],
    );
    units.push({ id: unitId, cnpj: unit.cnpj, name: unit.name.trim(), cityState: unit.cityState.trim() });
  }
  await appendClientAudit(client, context, "client.created", id);
  return companyFromRow(inserted.rows[0], units);
}

export async function setClientCompanyStatusInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  companyId: string,
  status: ClientCompany["status"],
): Promise<ClientCompany | null> {
  if (!companyId || companyId.length > 200 || !["active", "archived"].includes(status)) throw new Error("Confira o cadastro e a situação informada.");
  await lockTenant(client, context.tenantId);
  await requireProvisionedTenant(client, context.tenantId);
  const current = await client.query<CompanyRow>(
    `SELECT id, tenant_id, legal_name, trade_name, contact_name, contact_email,
            contact_phone, status, created_at, updated_at
     FROM sst.client_companies WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [context.tenantId, companyId],
  );
  const row = current.rows[0];
  if (!row || row.status === status) return null;
  if (status === "active") assertTenantCapacity(context.tenantId, "companies", await activeCompanyCount(client, context.tenantId));

  const updated = await client.query<CompanyRow>(
    `UPDATE sst.client_companies SET status = $3, updated_at = clock_timestamp()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, legal_name, trade_name, contact_name, contact_email,
               contact_phone, status, created_at, updated_at`,
    [context.tenantId, companyId, status],
  );
  await appendClientAudit(client, context, "client.status_changed", companyId);
  const units = await listUnits(client, context.tenantId, [companyId]);
  return companyFromRow(updated.rows[0], units.get(companyId) ?? []);
}

export function validateNewClientCompany(input: NewClientCompany) {
  validateInput(input);
}
