import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

if (!process.argv.includes("--apply")) { console.error("Uso: pnpm thirdparty:gate:rules:import --apply"); process.exit(2); }
const input = JSON.parse(await readFile(join(process.cwd(), "data", "third-party-gate-rules.json"), "utf8"));
const pool = new pg.Pool(loadRuntimePostgresConfig()); let client;
try {
  client = await pool.connect(); await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  for (const rule of input.rules ?? []) {
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [rule.tenantId]);
    const existing = await client.query("SELECT id FROM sst.third_party_compliance_rules WHERE tenant_id=$1 AND title=$2 AND document_kind=$3", [rule.tenantId, rule.title, rule.documentKind]);
    if (existing.rowCount) throw new Error("Critério já importado ou divergente.");
    await client.query(`INSERT INTO sst.third_party_compliance_rules (tenant_id,id,title,document_kind,criteria,source_title,source_version,jurisdiction,valid_from,valid_until,reviewer,version,status,previous_rule_id,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,1,'active',NULL,'sst-demo-user',$11)`, [rule.tenantId, randomUUID(), rule.title, rule.documentKind, rule.criteria, rule.sourceTitle, rule.sourceVersion, rule.jurisdiction, rule.validFrom, rule.reviewer, new Date().toISOString()]);
  }
  await client.query("COMMIT"); console.log(JSON.stringify({ status: "imported", rules: input.rules.length }));
} catch (error) { try { await client?.query("ROLLBACK"); } catch {} console.error(`Importação interrompida (${error instanceof Error ? error.message : "erro"}). Nenhuma gravação parcial foi mantida.`); process.exitCode = 1; }
finally { client?.release(); await pool.end(); }
