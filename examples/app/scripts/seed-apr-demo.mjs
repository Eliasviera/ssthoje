import { readFileSync } from "node:fs";
import pg from "pg";

// Cria uma APR de demonstração a partir dos riscos do PGR aprovado da empresa-modelo.
// Usa o próprio store do app (createSafetyApr) para respeitar todas as regras de validação.
const INVENTORY = "pdf-f05f31498b17b47c98d8fc9c3fed94f719f176ed0e92490b";
const TENANT = "tenant-horizonte";
const EMA = "9ce34336-c3c5-4598-a315-8ec457ca27ae";

const password = readFileSync("../../.env.pg.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("POSTGRES_PASSWORD=")).slice(18).trim();
const client = new pg.Client({ host: "127.0.0.1", port: 54329, database: "sst_hoje_dev", user: "sst_hoje_dev", password });
await client.connect();

try {
  const inv = await client.query("SELECT title, revision, status FROM sst.pgr_risk_inventories WHERE id=$1 AND tenant_id=$2", [INVENTORY, TENANT]);
  if (!inv.rowCount) throw new Error("Inventário não encontrado.");
  const { title, revision, status } = inv.rows[0];
  if (status !== "approved") throw new Error(`O inventário precisa estar aprovado (está em ${status}).`);

  // Riscos escolhidos: solda e pintura, os mais representativos da operação.
  const risks = await client.query(
    `SELECT id, activity, hazard, possible_harm, exposure_description
       FROM sst.pgr_risk_items
      WHERE tenant_id=$1 AND inventory_id=$2
        AND hazard IN ('CROMO (Pintura)','Projeção de Particulas','TOLUENO','CORTE','TRABALHO EM ALTURA','Movimentação de cargas e volumes')
      ORDER BY activity, hazard LIMIT 6`,
    [TENANT, INVENTORY],
  );
  console.log("riscos selecionados:", risks.rowCount);
  risks.rows.forEach((r) => console.log(" ·", r.activity, "—", r.hazard));

  const companies = JSON.parse(readFileSync("data/clients.json", "utf8"));
  const unitId = companies[0].units[0].id;
  const templates = JSON.parse(readFileSync("data/safety-operations.json", "utf8")).templates
    .filter((t) => t.tenantId === TENANT && t.status === "active");
  const template = templates.find((t) => t.title === "APR Geral") ?? templates[0];
  console.log("modelo de checklist:", template.title, "v" + template.version);

  // Carrega o store do app via TS loader do próprio projeto.
  const store = await import("../src/lib/safety-operations-store.ts");

  const apr = store.createSafetyApr({
    tenantId: TENANT,
    companyId: EMA,
    unitId,
    title: "APR — Solda e pintura da estrutura metálica",
    activityStage: "Solda, corte e pintura de estrutura metálica em área interna",
    // responsible limitado a 120 caracteres pelo store
    workArea: "Galpão de fabricação — bancadas de solda e cabine de pintura",
    responsible: "Elias Alves Vieira",
    pgrInventoryId: INVENTORY,
    pgrRevision: Number(revision),
    pgrTitle: title,
    risks: risks.rows.map((r) => ({
      inventoryId: INVENTORY,
      inventoryRevision: Number(revision),
      riskId: r.id,
      activity: r.activity,
      hazard: r.hazard,
      possibleHarm: r.possible_harm,
      exposureDescription: r.exposure_description,
    })),
    additionalRisks: [
      {
        hazard: "Faísca de solda atingindo material inflamável próximo à bancada",
        possibleHarm: "Princípio de incêndio e queimaduras",
        identificationBasis: "Observação direta na avaliação da tarefa (não consta no PGR selecionado)",
        controls: ["Remover materiais combustíveis num raio de 10 m", "Manter extintor ao lado da bancada", "Usar anteparo contra respingos"],
      },
    ],
    checklistTemplateId: template.id,
    checklistTemplateVersion: template.version,
    createdBy: "sst-demo-user",
  });

  console.log("\nAPR criada:", apr.id);
  console.log("status:", apr.status, "| revisão:", apr.revision, "| riscos:", apr.risks.length);
  console.log("itens de checklist:", apr.answers.length);
} catch (error) {
  console.error("Falha:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
