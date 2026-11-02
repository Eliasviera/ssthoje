import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PoolClient } from "pg";
import {
  createClientCompanyInTransaction,
  listClientCompaniesInTransaction,
  setClientCompanyStatusInTransaction,
} from "../src/lib/client-postgres-operations.ts";
import { executeTenantWriteTransaction, type TenantWriteContext } from "../src/lib/tenant-write-operations.ts";

const context: TenantWriteContext = { tenantId: "tenant-fixture", userId: "actor-fixture", role: "consultoria_admin" };
const timestamp = "2026-10-12T12:00:00.000Z";

function companyRow(values: unknown[], status: "active" | "archived" = "active") {
  return {
    tenant_id: values[0], id: values[1], legal_name: values[2], trade_name: values[3],
    contact_name: values[4], contact_email: values[5], contact_phone: values[6],
    status, created_at: values[7] ?? timestamp, updated_at: values[7] ?? timestamp,
  };
}

function fakeClient(options: { duplicate?: boolean; auditFails?: boolean } = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      if (normalized.includes("FROM sst.tenants")) return { rows: [{ id: context.tenantId }], rowCount: 1 };
      if (normalized.includes("count(*)::int AS count")) return { rows: [{ count: 0 }], rowCount: 1 };
      if (normalized.includes("SELECT cnpj_normalized")) {
        return options.duplicate
          ? { rows: [{ cnpj_normalized: "12345678000195" }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("INSERT INTO sst.client_companies")) return { rows: [companyRow(values)], rowCount: 1 };
      if (normalized.startsWith("SELECT id, tenant_id, legal_name") && normalized.includes("FOR UPDATE")) {
        return { rows: [companyRow([context.tenantId, "company-fixture", "Empresa fictícia", "Fictícia", "Contato", "", "", timestamp], "archived")], rowCount: 1 };
      }
      if (normalized.startsWith("UPDATE sst.client_companies")) {
        return { rows: [companyRow([context.tenantId, values[1], "Empresa fictícia", "Fictícia", "Contato", "", "", timestamp], "active")], rowCount: 1 };
      }
      if (normalized.startsWith("SELECT id, company_id, cnpj, name, city_state")) {
        return { rows: [{ id: "unit-fixture", company_id: "company-fixture", cnpj: "12345678000195", name: "Unidade", city_state: "Cidade/UF" }], rowCount: 1 };
      }
      if (normalized.startsWith("INSERT INTO sst.client_audit_history") && options.auditFails) throw new Error("falha simulada da auditoria");
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as unknown as PoolClient, statements };
}

async function inIsolatedWorkingDirectory<T>(operation: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "sst-client-postgres-test-"));
  process.chdir(root);
  try {
    return await operation();
  } finally {
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
}

const newCompany = {
  tenantId: context.tenantId,
  legalName: "Empresa fictícia",
  tradeName: "Fictícia",
  contactName: "Contato fictício",
  contactEmail: "",
  contactPhone: "",
  units: [{ cnpj: "12345678000195", name: "Unidade fictícia", cityState: "Cidade/UF" }],
};

test("criação grava empresa, unidade e auditoria no mesmo fluxo transacional", async () => inIsolatedWorkingDirectory(async () => {
  const { client, statements } = fakeClient();
  const company = await executeTenantWriteTransaction(client, context, (tx, access) =>
    createClientCompanyInTransaction(tx, access, newCompany));
  const queries = statements.map(({ sql }) => sql);

  assert.equal(company.status, "active");
  assert.equal(company.units.length, 1);
  assert.ok(queries.indexOf("BEGIN") < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_companies")));
  assert.ok(queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_companies")) < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_units")));
  assert.ok(queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_units")) < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_audit_history")));
  assert.equal(queries.at(-1), "COMMIT");
}));

test("duplicidade histórica de CNPJ bloqueia nova empresa sem inserir nem auditar", async () => inIsolatedWorkingDirectory(async () => {
  const { client, statements } = fakeClient({ duplicate: true });
  await assert.rejects(
    executeTenantWriteTransaction(client, context, (tx, access) => createClientCompanyInTransaction(tx, access, newCompany)),
    /CNPJ já está cadastrado/,
  );
  const queries = statements.map(({ sql }) => sql);
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO sst.client_companies")), false);
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO sst.client_audit_history")), false);
}));

test("falha ao gravar auditoria reverte a transação inteira", async () => inIsolatedWorkingDirectory(async () => {
  const { client, statements } = fakeClient({ auditFails: true });
  await assert.rejects(
    executeTenantWriteTransaction(client, context, (tx, access) => createClientCompanyInTransaction(tx, access, newCompany)),
    /falha simulada da auditoria/,
  );
  const queries = statements.map(({ sql }) => sql);
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.client_companies")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.client_units")));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.includes("COMMIT"), false);
}));

test("reativação atualiza estado e cria evento na mesma transação", async () => inIsolatedWorkingDirectory(async () => {
  const { client, statements } = fakeClient();
  const company = await executeTenantWriteTransaction(client, context, (tx, access) =>
    setClientCompanyStatusInTransaction(tx, access, "company-fixture", "active"));
  const queries = statements.map(({ sql }) => sql);

  assert.equal(company?.status, "active");
  assert.ok(queries.findIndex((sql) => sql.startsWith("UPDATE sst.client_companies")) < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.client_audit_history")));
  assert.equal(queries.at(-1), "COMMIT");
}));

test("leitura de empresas e unidades filtra o tenant e mapeia datas e campos", async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      if (normalized.startsWith("SELECT id, tenant_id, legal_name")) {
        return { rows: [companyRow([context.tenantId, "company-fixture", "Empresa fictícia", "Fictícia", "Contato", "", "", timestamp], "archived")], rowCount: 1 };
      }
      if (normalized.startsWith("SELECT id, company_id, cnpj, name, city_state")) {
        return { rows: [{ id: "unit-fixture", company_id: "company-fixture", cnpj: "12345678000195", name: "Unidade fictícia", city_state: "Cidade/UF" }], rowCount: 1 };
      }
      throw new Error(`Consulta inesperada: ${normalized}`);
    },
  } as unknown as PoolClient;

  const companies = await listClientCompaniesInTransaction(client, context.tenantId);
  assert.equal(companies.length, 1);
  assert.equal(companies[0].tenantId, context.tenantId);
  assert.equal(companies[0].status, "archived");
  assert.equal(companies[0].createdAt, timestamp);
  assert.deepEqual(companies[0].units, [{ id: "unit-fixture", cnpj: "12345678000195", name: "Unidade fictícia", cityState: "Cidade/UF" }]);
  assert.deepEqual(statements.map(({ values }) => values[0]), [context.tenantId, context.tenantId]);
  assert.deepEqual(statements[1].values[1], ["company-fixture"]);
});

test("leitura sem empresas não consulta unidades", async () => {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;

  assert.deepEqual(await listClientCompaniesInTransaction(client, context.tenantId), []);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /FROM sst\.client_companies WHERE tenant_id = \$1/);
});
