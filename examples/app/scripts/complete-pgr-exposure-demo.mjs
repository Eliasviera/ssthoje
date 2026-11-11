import { readFileSync } from "node:fs";
import pg from "pg";

// Completa os 18 itens do inventário que vieram sem descrição de exposição,
// preservando processo, atividade, perigo, circunstância e dano já extraídos do documento.
// Modo --apply grava; sem ele, apenas mostra o que mudaria.
// Não altera status do inventário nem aprova nada: só completa o campo vazio.

const apply = process.argv.includes("--apply");
const TENANT = "tenant-horizonte";
const INVENTORY = "pdf-f05f31498b17b47c98d8fc9c3fed94f719f176ed0e92490b";

// Texto de exposição por natureza do perigo, no padrão das linhas já completas.
const BY_KIND = [
  { test: /acetato|iso-propanol|nafta|diclorometano|alumínio|cromo/i, text: "Uso diário na atividade, com contato dérmico e inalação durante a aplicação; conferir FDS e medidas de controle no original." },
  { test: /ru[íi]do/i, text: "Diário, ao longo da jornada, conforme medição registrada no original." },
  { test: /corte/i, text: "Diário, durante a execução da atividade, com risco de projeção de partículas e contato com partes móveis." },
  { test: /condução de máquinas/i, text: "Diário, ao longo do turno de operação dos equipamentos." },
  { test: /trabalho em altura/i, text: "Eventual, somente nas atividades que exigem acesso acima de 2 m, com autorização e procedimento específico." },
  { test: /movimenta|movimentação/i, text: "Diário, durante o carregamento, descarregamento e deslocamento interno de materiais." },
  { test: /projeção de part[ií]culas/i, text: "Diário, durante a operação que gera partículas, com uso de proteção ocular e facial." },
  { test: /queda de objetos/i, text: "Eventual, em atividades com movimentação de cargas em altura ou manuseio de peças sobrepostas." },
  { test: /postura sentada/i, text: "Diário, por períodos prolongados no posto de trabalho." },
];

const DEFAULT_TEXT = "Diário, durante a execução da atividade, conforme descrito no documento de origem.";

const client = new pg.Client({
  host: "127.0.0.1",
  port: 54329,
  database: "sst_hoje_dev",
  user: "sst_hoje_dev",
  password: readFileSync("../../.env.pg.local", "utf8").split(/\r?\n/).find((line) => line.startsWith("POSTGRES_PASSWORD="))?.slice(18).trim(),
});

await client.connect();

try {
  const { rows } = await client.query(
    `SELECT id, activity, hazard FROM sst.pgr_risk_items
      WHERE tenant_id = $1 AND inventory_id = $2 AND exposure_description = ''
      ORDER BY activity, hazard`,
    [TENANT, INVENTORY],
  );

  console.log(`Itens sem descrição de exposição: ${rows.length}\n`);

  await client.query("BEGIN");
  let updated = 0;
  for (const row of rows) {
    const rule = BY_KIND.find((entry) => entry.test.test(row.hazard));
    const text = rule ? rule.text : DEFAULT_TEXT;
    if (apply) {
      await client.query(
        `UPDATE sst.pgr_risk_items SET exposure_description = $3, updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND inventory_id = $2 AND id = $4 AND exposure_description = ''`,
        [TENANT, INVENTORY, text, row.id],
      );
    }
    updated++;
    console.log(`· ${row.activity} · ${row.hazard.slice(0, 40)}`);
    console.log(`   ${text.slice(0, 90)}…`);
  }

  if (apply) {
    await client.query("COMMIT");
    console.log(`\nGRAVADO: ${updated} item(ns) completados.`);
  } else {
    await client.query("ROLLBACK");
    console.log(`\nSimulação: ${updated} item(ns) seriam completados. Nada foi gravado.`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Falha:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
