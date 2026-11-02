import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

if (!process.argv.includes("--apply")) { console.error("Uso: pnpm thirdparty:gate:requirements:import --apply"); process.exit(2); }
const input = JSON.parse(await readFile(join(process.cwd(), "data", "third-party-gate-requirements.json"), "utf8"));
const pool = new pg.Pool(loadRuntimePostgresConfig());
let client;
try {
  if (!Array.isArray(input.requirementSets)) throw new Error("Formato de origem inválido.");
  client = await pool.connect(); await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  for (const set of input.requirementSets) {
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [set.tenantId]);
    const scope = await client.query(`SELECT 1 FROM sst.client_companies c JOIN sst.client_units u ON u.tenant_id = c.tenant_id AND u.company_id = c.id WHERE c.tenant_id=$1 AND c.id=$2 AND u.id=$3 AND c.status='active'`, [set.tenantId, set.companyId, set.unitId]);
    if (!scope.rowCount) throw new Error("Escopo de empresa ou unidade indisponível.");
    if (!Number.isInteger(set.revision) || set.revision < 1) throw new Error("Revisão do checklist inválida.");
    const active = await client.query("SELECT id, revision FROM sst.third_party_requirement_sets WHERE tenant_id=$1 AND company_id=$2 AND unit_id=$3 AND status='active'", [set.tenantId, set.companyId, set.unitId]);
    if (set.revision === 1 && active.rowCount) throw new Error("Já existe checklist ativo para este escopo; use a próxima revisão.");
    if (set.revision > 1 && (!active.rowCount || Number(active.rows[0].revision) !== set.revision - 1)) throw new Error("A revisão informada não sucede o checklist ativo.");
    const id = randomUUID(), now = new Date().toISOString();
    if (active.rowCount) await client.query("UPDATE sst.third_party_requirement_sets SET status='superseded' WHERE tenant_id=$1 AND id=$2", [set.tenantId, active.rows[0].id]);
    await client.query(`INSERT INTO sst.third_party_requirement_sets (tenant_id,id,company_id,unit_id,revision,status,previous_set_id,created_by,created_at) VALUES ($1,$2,$3,$4,$5,'active',$6,'sst-demo-user',$7)`, [set.tenantId, id, set.companyId, set.unitId, set.revision, active.rows[0]?.id ?? null, now]);
    for (const item of set.requirements) await client.query(`INSERT INTO sst.third_party_requirement_items (tenant_id,requirement_set_id,document_kind,medical_restricted,restricted_note) VALUES ($1,$2,$3,$4,$5)`, [set.tenantId, id, item.documentKind, Boolean(item.medicalRestricted), item.restrictedNote ?? ""]);
  }
  await client.query("COMMIT"); console.log(JSON.stringify({ status: "imported", requirementSets: input.requirementSets.length }));
} catch (error) { try { await client?.query("ROLLBACK"); } catch {} console.error(`Importação interrompida (${error instanceof Error ? error.message : "erro"}). Nenhuma gravação parcial foi mantida.`); process.exitCode = 1; }
finally { client?.release(); await pool.end(); }
