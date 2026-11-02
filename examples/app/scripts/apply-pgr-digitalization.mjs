import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";
import { requireTenantAccess } from "../src/lib/tenant-access.ts";
import { appendAuditEvent } from "../src/lib/audit-log.ts";
import { enrichPgrProfile, projectPgrInventory } from "../src/lib/pgr-profile-projection.ts";
import { applyPgrColumnCorrections } from "../src/lib/pgr-column-corrections.ts";
import { validatePgrRiskInventory } from "../src/lib/pgr-risk-inventory.ts";
import { createPgrInventoryInTransaction, savePgrInventoryInTransaction } from "../src/lib/pgr-postgres-operations.ts";
import { executeTenantWriteTransaction } from "../src/lib/tenant-write-operations.ts";

const args = process.argv.slice(2);
const profileVersion = args.includes("--version") ? Number(args[args.indexOf("--version") + 1]) : 1;
if (![1,2,3].includes(profileVersion)) throw Error("Versão de perfil inválida.");
const option = name => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw Error(`Falta ${name}`); return args[index + 1]; };
const tenantId = option("--tenant"), companyId = option("--company"), documentId = option("--document"), userId = option("--actor");
if (![tenantId, companyId, documentId, userId].every(value => /^[a-zA-Z0-9_-]{1,140}$/.test(value))) throw Error("Identificador inválido.");
for (const permission of ["pgr.manage", "tenant.clients.manage", "documents.read"]) {
  if (!requireTenantAccess(userId, permission, tenantId).ok) throw Error("Ator sem permissão no escopo.");
}
const access = requireTenantAccess(userId, "pgr.manage", tenantId);
const context = { tenantId, userId, role: access.context.membership.role };
const clientsPath = join(process.cwd(), "data", "clients.json");
const originalClients = readFileSync(clientsPath);
const clients = JSON.parse(originalClients);
const company = clients.find(value => value.tenantId === tenantId && value.id === companyId && value.status === "active");
const documents = JSON.parse(readFileSync("data/documents.json", "utf8"));
const document = documents.find(value => value.tenantId === tenantId && value.companyId === companyId && value.id === documentId && value.kind === "PGR");
if (!company || !document) throw Error("Empresa/documento fora do escopo.");
const unit = company.units.find(value => value.id === document.unitId);
if (!unit) throw Error("Unidade não encontrada.");
const directory = join("data", "pgr-digitalization", tenantId, companyId);
const baseProfile = enrichPgrProfile(JSON.parse(readFileSync(join(directory, "source-v1.json"), "utf8")));
const profile = profileVersion === 3 ? applyPgrColumnCorrections(baseProfile, JSON.parse(readFileSync(join(directory,"column-corrections-v2.json"),"utf8"))) : baseProfile;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
if (profile.sha256 !== digest(readFileSync(join("data", "document-files", tenantId, document.storageName)))) throw Error("PDF e extração divergem.");
const sourceCnpj = profile.companyFields.CNPJ?.[0]?.value.replace(/\D/g, "");
if (sourceCnpj !== unit.cnpj.replace(/\D/g, "")) throw Error("CNPJ da fonte diverge da unidade.");
const inventory = projectPgrInventory(profile, { tenantId, companyId, unitId: unit.id, documentId });
const checked = validatePgrRiskInventory(inventory);
if ("error" in checked) throw Error(checked.error);
const inventoryId = `pdf-${digest(Buffer.from(`${tenantId}:${documentId}:${profile.sha256}`)).slice(0, 48)}`;
const email = profile.companyFields.Email?.[0]?.value.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)?.[0] ?? "";
const phone = profile.companyFields.Telefone?.[0]?.value ?? "";
// Fill missing contact channels only; do not reassign a legal/technical signatory as contact.
if (!company.contactEmail && email.length <= 254) company.contactEmail = email;
if (!company.contactPhone && phone.length <= 30) company.contactPhone = phone;
const report = { roles: profile.roles.length, sectors: new Set(profile.roles.map(value => value.sector)).size,
  riskItems: inventory.items.length, measures: inventory.items.reduce((count, item) => count + item.existingMeasures.length, 0),
  actions: profile.actions.length, reportedIntensities: profile.exposures.filter(value => value.intensity).length, quantitativeRecords: profile.exposures.length, inventoryId };
if (!args.includes("--apply")) { console.log(JSON.stringify({ mode: "dry_run", ...report })); process.exit(0); }
const receiptPath = join(directory, `applied-v${profileVersion}.json`);
if (existsSync(receiptPath)) {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (receipt.sha256 !== profile.sha256 || receipt.inventoryId !== inventoryId || receipt.documentId !== documentId) throw Error("Importação anterior divergente.");
  console.log(JSON.stringify({ status: "already_applied", ...report })); process.exit(0);
}
const backupPath = join(directory, "clients-before-apply.json");
if (!existsSync(backupPath)) writeFileSync(backupPath, originalClients, { flag: "wx" });
const profilePath = join(directory, `imported-v${profileVersion}.json`);
const storedProfile = { ...profile, tenantId, companyId, unitId: unit.id, documentId, inventoryId };
if (!existsSync(profilePath)) writeFileSync(profilePath, JSON.stringify(storedProfile), { flag: "wx" });
else if (readFileSync(profilePath, "utf8") !== JSON.stringify(storedProfile)) throw Error("Perfil preparado divergente.");
const pool = new pg.Pool(loadRuntimePostgresConfig());
try {
  const db = await pool.connect();
  try {
    await executeTenantWriteTransaction(db, context, async client => {
      await client.query("SELECT pg_advisory_xact_lock(22024, hashtext($1))", [tenantId]);
      const existing = await client.query("SELECT id, legal_name FROM sst.client_companies WHERE tenant_id=$1 AND id=$2", [tenantId, companyId]);
      if (!existing.rowCount) {
        const duplicate = await client.query("SELECT id FROM sst.client_units WHERE tenant_id=$1 AND cnpj_normalized=$2", [tenantId, sourceCnpj]);
        if (duplicate.rowCount) throw Error("CNPJ já representado por outro cadastro no banco.");
        await client.query("INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)", [tenantId,companyId,company.legalName,company.tradeName,company.contactName,company.contactEmail,company.contactPhone,company.createdAt,company.updatedAt]);
        for (const sourceUnit of company.units) await client.query("INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,$2,$3,$4,$5,$6)", [tenantId,sourceUnit.id,companyId,sourceUnit.cnpj,sourceUnit.name,sourceUnit.cityState]);
        await client.query("INSERT INTO sst.client_audit_history (id,tenant_id,actor_user_id,actor_role,action,target_id,occurred_at) VALUES ($1,$2,$3,$4,'client.created',$5,clock_timestamp())", [randomUUID(),tenantId,userId,context.role,companyId]);
      } else if (existing.rows[0].legal_name !== company.legalName) throw Error("Cadastro PostgreSQL diverge da origem.");
      const prior = await client.query("SELECT r.content FROM sst.pgr_risk_inventory_revisions r WHERE tenant_id=$1 AND inventory_id=$2 ORDER BY revision DESC LIMIT 1", [tenantId,inventoryId]);
      if (prior.rowCount) {
        if (prior.rowCount !== 1) throw Error("Inventário importado já foi alterado.");
        // Compare recursively independent of JSONB key ordering before resuming.
        const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
        const current = prior.rows[0].content;
        if (JSON.stringify(canonical({...current,revision:1})) !== JSON.stringify(canonical(inventory))) {
          if (!((profileVersion === 2 && current.revision === 1) || (profileVersion === 3 && current.revision === 2))) throw Error("Inventário existente diverge da fonte.");
          if (profileVersion === 3) {
            const previous=projectPgrInventory(JSON.parse(readFileSync(join(directory,"imported-v2.json"),"utf8")),{tenantId,companyId,unitId:unit.id,documentId});
            if (JSON.stringify(canonical({...current,revision:1})) !== JSON.stringify(canonical(previous))) throw Error("Inventário alterado após importação; não sobrescrever.");
          }
          const withoutChangedField = value => ({...value,revision:1,items:value.items.map(item=>({...item,...(profileVersion === 2 ? {exposureDescription:""} : {sourceCircumstance:""})}))});
          if (JSON.stringify(canonical(withoutChangedField(current))) !== JSON.stringify(canonical(withoutChangedField(inventory)))) throw Error("Alteração fora dos campos autorizados; não sobrescrever.");
          const saved=await savePgrInventoryInTransaction(client,context,inventoryId,current.revision,{...inventory,revision:current.revision+1},context);
          if (!saved) throw Error("Conflito ao completar os quadros quantitativos.");
        }
      } else await createPgrInventoryInTransaction(client, context, inventoryId, inventory, context);
    });
  } finally { db.release(); }
} finally { await pool.end(); }
// JSON remains the client runtime. Preserve a backup and refuse stale writes.
if (digest(readFileSync(clientsPath)) !== digest(originalClients)) throw Error("Cadastro alterado em paralelo; repetir para reconciliar, sem sobrescrever.");
if (JSON.stringify(clients) !== JSON.stringify(JSON.parse(originalClients))) {
  company.updatedAt = new Date().toISOString();
  const temporary = `${clientsPath}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(clients, null, 2), { flag: "wx" });
  renameSync(temporary, clientsPath);
  appendAuditEvent({ tenantId, actorUserId: userId, actorRole: context.role, action: "client.updated", targetId: companyId });
}
writeFileSync(receiptPath, JSON.stringify({ tenantId,companyId,documentId,inventoryId,sha256:profile.sha256,appliedAt:new Date().toISOString(),actorUserId:userId,profileFile:`imported-v${profileVersion}.json`,report }), { flag:"wx" });
console.log(JSON.stringify({ status: "applied", ...report }));
