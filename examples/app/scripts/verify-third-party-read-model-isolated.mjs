import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { listThirdPartySnapshotsInTransaction } from "../src/lib/third-party-postgres-read-operations.ts";

// Nunca lê .env ou a configuração do banco persistente.
const name = `sst-thirdparty-read-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(32).toString("base64url");
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
const tables = ["invitation", "receipt", "issue", "issue_event", "approval", "schedule", "audit"];
const stamp = "2026-10-15T12:00:00.000Z";
let started = false, pool, stage = "start";
try {
  docker(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_USER=sst_isolated", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=sst_hoje_dev", "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const port = Number(docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  assert.ok(Number.isInteger(port) && port > 0);
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "sst_isolated", password, database: "sst_hoje_dev", max: 2, connectionTimeoutMillis: 1000 });
  stage = "readiness";
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(ready);
  stage = "candidate-schema";
  await pool.query("CREATE SCHEMA sst");
  for (const file of ["0001_tenant_registry.sql", "0004_client_companies.sql", "0005_pgr_risk_inventory.sql"]) {
    await pool.query(await readFile(resolve("db/migrations", file), "utf8"));
  }
  await pool.query(await readFile(resolve("../../schemas/third-party-postgres-read-model.sql"), "utf8"));
  stage = "synthetic-fixtures";
  for (const tenant of ["tenant-a", "tenant-b"]) {
    await pool.query("INSERT INTO sst.tenants (id,name) VALUES ($1,'Consultoria fictícia')", [tenant]);
    await pool.query("INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at) VALUES ($1,'company','Empresa fictícia','','','','','active',now(),now())", [tenant]);
    await pool.query("INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,'unit','company','11111111000111','Unidade fictícia','Teste')", [tenant]);
    const invitation = { id: "invite", tenantId: tenant, companyId: "company", unitId: "unit", companyName: "Empresa fictícia", unitName: "Unidade fictícia", relatedCnpj: "11111111000111", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", tokenHash: "a".repeat(64), requested: ["PGR"], createdAt: stamp, expiresAt: "2026-10-16T12:00:00.000Z" };
    const receipt = { id: "receipt", kind: "PGR", fileName: "ficticio.pdf", storageName: "private-file.pdf", size: 10, digest: "b".repeat(64), receivedAt: stamp };
    const issue = { id: "issue", kind: "PGR", originalReceiptId: "receipt", currentReceiptId: "receipt", reason: "Motivo fictício", requestedChange: "Correção fictícia", assigneeUserId: "reviewer", status: "open", revision: 1 };
    const event = { id: "event", type: "opened", occurredAt: stamp, actorUserId: "reviewer", receiptId: "receipt", notes: "Motivo fictício", evidence: "Evidência fictícia" };
    const approval = { id: "approval", tenantId: tenant, invitationId: "invite", fingerprint: "c".repeat(64), approvedBy: "reviewer", approvedAt: stamp, notes: "Snapshot sintético, sem efeito operacional" };
    const schedule = { id: "schedule", tenantId: tenant, invitationId: "invite", approvalId: "approval", scheduledOn: "2026-10-16", createdBy: "reviewer", createdAt: stamp };
    const audit = { id: "audit", tenantId: tenant, actorUserId: "reviewer", actorRole: "sst_tst", action: "thirdparty.read", targetId: "invite", occurredAt: stamp };
    await pool.query("INSERT INTO sst.third_party_invitation_snapshots VALUES ($1,'invite','company','unit',0,$2)", [tenant, invitation]);
    await pool.query("INSERT INTO sst.third_party_receipt_snapshots VALUES ($1,'invite','receipt',0,$2)", [tenant, receipt]);
    await pool.query("INSERT INTO sst.third_party_issue_snapshots VALUES ($1,'invite','issue','receipt','receipt',0,$2)", [tenant, issue]);
    await pool.query("INSERT INTO sst.third_party_issue_event_snapshots VALUES ($1,'invite','issue','event','receipt',0,$2)", [tenant, event]);
    await pool.query("INSERT INTO sst.third_party_approval_snapshots VALUES ($1,'invite','approval',0,$2)", [tenant, approval]);
    await pool.query("INSERT INTO sst.third_party_schedule_snapshots VALUES ($1,'invite','approval','schedule',0,$2)", [tenant, schedule]);
    await pool.query("INSERT INTO sst.third_party_audit_snapshots VALUES ($1,'audit',0,$2)", [tenant, audit]);
  }
  stage = "immutability-and-foreign-keys";
  for (const table of tables) {
    for (const mutation of [`UPDATE sst.third_party_${table}_snapshots SET payload = payload`, `DELETE FROM sst.third_party_${table}_snapshots`]) await assert.rejects(pool.query(mutation), { code: "55000" });
  }
  await assert.rejects(pool.query("TRUNCATE sst.third_party_audit_snapshots"), { code: "55000" });
  await assert.rejects(pool.query("INSERT INTO sst.third_party_receipt_snapshots VALUES ('tenant-a','missing','bad',1,'{\"id\":\"bad\"}')"), { code: "23503" });
  await assert.rejects(pool.query("INSERT INTO sst.third_party_invitation_snapshots VALUES ('tenant-a','bad','company','unit',1,'{}')"), { code: "23514" });
  stage = "runtime-rls";
  const client = await pool.connect();
  try {
    await client.query("SET ROLE sst_hoje_app");
    await client.query("BEGIN READ ONLY");
    for (const table of tables) assert.equal((await client.query(`SELECT * FROM sst.third_party_${table}_snapshots`)).rowCount, 0);
    await client.query("SELECT set_config('sst.tenant_id','tenant-a',true)");
    for (const table of tables) {
      const visible = await client.query(`SELECT tenant_id FROM sst.third_party_${table}_snapshots`);
      assert.equal(visible.rowCount, 1); assert.equal(visible.rows[0].tenant_id, "tenant-a");
    }
    const summaries = await listThirdPartySnapshotsInTransaction(client, "tenant-a", new Date(stamp));
    assert.equal(summaries.length, 1); assert.equal(summaries[0].issues.length, 1);
    assert.equal(JSON.stringify(summaries).includes("tokenHash"), false); assert.equal(JSON.stringify(summaries).includes("private-file.pdf"), false);
    await client.query("ROLLBACK");
    for (const table of tables) await assert.rejects(client.query(`INSERT INTO sst.third_party_${table}_snapshots DEFAULT VALUES`), { code: "42501" });
    await client.query("RESET ROLE");
  } finally { client.release(); }
  console.log("Terceiros isolado: schema candidato, FKs, identidade obrigatória, histórico imutável, RLS nas 7 tabelas, papel sem escrita e adaptador de leitura aprovados.");
} catch (error) {
  console.error(`Verificação isolada não concluída na etapa ${stage} (${typeof error?.code === "string" ? error.code : "verification-error"}). Banco ativo não utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) {
    try { docker(["rm", "-f", name]); }
    catch { console.error(`Remoção do container temporário ${name} não confirmada.`); process.exitCode = 1; }
  }
}
