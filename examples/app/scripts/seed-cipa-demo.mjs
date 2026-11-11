import { readFileSync } from "node:fs";
import pg from "pg";

// Popula a CIPA de demonstração da empresa-modelo: catálogo NR-5, mandato, membros,
// reunião ordinária, ata, assinaturas e ações. Só dados fictícios.
const apply = process.argv.includes("--apply");
const TENANT = "tenant-horizonte";
const EMA = "9ce34336-c3c5-4598-a315-8ec457ca27ae";
const password = readFileSync("../../.env.pg.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("POSTGRES_PASSWORD=")).slice(18).trim();

const clients = JSON.parse(readFileSync("data/clients.json", "utf8"));
const company = clients[0];
const unitId = company.units[0].id;
const workers = JSON.parse(readFileSync("data/workers.json", "utf8"));
const byRole = (title) => workers.find((w) => w.jobTitle === title);

const c = new pg.Client({ host: "127.0.0.1", port: 54329, database: "sst_hoje_dev", user: "sst_hoje_dev", password });
await c.connect();

const HASH = "c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55";

try {
  await c.query("BEGIN");

  // 1. Catálogo NR-5 conferido (Quadro I — faixas usadas na demonstração, GR 3)
  await c.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, issued_at, valid_from, source_url, source_hash, status, reviewer, reviewed_at, published_by, published_at)
    VALUES ('nr5-2022','NR-05 atualizada 2022','Portaria MTP nº 4.219, de 20/12/2022','2022-12-22','2023-03-20',
            'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-05-atualizada-2022.pdf',
            $1,'active','Elias (engenheiro de segurança do trabalho)',clock_timestamp(),'sst-demo-user',clock_timestamp())
    ON CONFLICT (id) DO NOTHING`, [HASH]);

  const bands = [[0,19,1,1],[20,29,1,1],[30,50,1,1],[51,80,2,2],[81,100,2,2],[101,120,2,2],[121,140,2,2],[141,300,3,2],[301,500,4,2]];
  for (const [from,to,ef,su] of bands) {
    await c.query(`INSERT INTO sst.nr5_dimension_bands (id,standard_id,risk_grade,employees_from,employees_to,effective_members,substitute_members)
      VALUES ($1,'nr5-2022',3,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [`nr5-2022-g3-${from}`,from,to,ef,su]);
  }
  await c.query(`INSERT INTO sst.nr5_training_requirements (id,standard_id,audience,risk_grade,min_hours,distance_learning_allowed,deadline_days_after_possession,reuse_within_months,source_item)
    VALUES ('nr5-2022-tr-g3','nr5-2022','cipa_member',3,16,false,30,24,'5.7.1.1/5.7.3/5.7.4'),
           ('nr5-2022-tr-rep','nr5-2022','named_representative',NULL,8,true,NULL,24,'5.7.4.3')
    ON CONFLICT DO NOTHING`);
  for (const [id,code,desc,days,item] of [
    ["nr5-el-60","election.call_notice","Convocar eleições com no mínimo 60 dias de antecedência do término do mandato",60,"5.5.1"],
    ["nr5-el-15","election.registration","Período mínimo de inscrição de candidatos",15,"5.5.3 b"],
    ["nr5-el-30","election.ballot","Realizar a eleição no mínimo 30 dias antes do término do mandato",30,"5.5.3 f"],
  ]) {
    await c.query(`INSERT INTO sst.nr5_election_rules (id,standard_id,code,description,min_days,source_item)
      VALUES ($1,'nr5-2022',$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [id,code,desc,days,item]);
  }

  // 2. Mandato vigente — 34 empregados, GR 3 → faixa 30–50: 1 efetivo + 1 suplente por representação
  await c.query(`INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,dimension_band_id,started_on,ends_on,possession_on,status,created_by,created_at)
    VALUES ($1,'cipa-demo-1',$2,$3,'nr5-2022',1,'elected',3,34,'nr5-2022-g3-30','2026-02-01','2027-01-31','2026-02-02','active','sst-demo-user',clock_timestamp())
    ON CONFLICT DO NOTHING`, [TENANT, EMA, unitId]);

  // 3. Membros: presidente (empregador/designado), vice (empregado/eleito), titulares e suplentes
  const encarregado = byRole("ENCARREGADO") ?? workers[0];
  const tecnico = byRole("TÉCNICO DE SEGURANÇA") ?? workers[1];
  const membros = [
    ["cipa-demo-m1", encarregado, "employer", "president", "titular", "designated", null, null],
    ["cipa-demo-m2", tecnico, "employee", "vice_president", "titular", "elected", "2026-01-20", 12],
    ["cipa-demo-m3", byRole("SOLDADOR") ?? workers[2], "employee", "member", "titular", "elected", "2026-01-20", 9],
    ["cipa-demo-m4", byRole("PINTOR") ?? workers[3], "employer", "member", "titular", "designated", null, null],
    ["cipa-demo-m5", byRole("MONTAGEM") ?? workers[4], "employee", "member", "suplente", "elected", "2026-01-20", 7],
    ["cipa-demo-m6", byRole("MANUTENÇÃO") ?? workers[5], "employer", "member", "suplente", "designated", null, null],
  ];
  let ordem = 1;
  for (const [id, worker, rep, role, seat, source, electedAt, votes] of membros) {
    await c.query(`INSERT INTO sst.cipa_members
      (tenant_id,id,term_id,worker_id,representation,role,seat,mandate_source,elected_at,possession_on,stability_until,
       succession_order,votes_received,status,training_completed_on,training_valid_until,training_hours)
      VALUES ($1,$2,'cipa-demo-1',$3,$4,$5,$6,$7,$8,'2026-02-02',$9,$10,$11,'active','2026-01-28','2028-01-28',16)
      ON CONFLICT DO NOTHING`,
      [TENANT,id,worker.id,rep,role,seat,source,electedAt,
       seat === "titular" ? "2028-01-31" : null,
       seat === "suplente" ? ordem++ : null, votes]);
  }

  // 4. Reuniões ordinárias realizadas (jul, ago, set, out) + agenda da próxima
  const reunioes = [
    ["cipa-demo-reu-1", 1, "2026-07-14 14:00-03"],
    ["cipa-demo-reu-2", 2, "2026-08-11 14:00-03"],
    ["cipa-demo-reu-3", 3, "2026-09-15 14:00-03"],
    ["cipa-demo-reu-4", 4, "2026-10-13 14:00-03"],
  ];
  for (const [id, seq, when] of reunioes) {
    await c.query(`INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,held_at,modality,secretary_member_id,status,decision_mode,deliberations_published_at,deliberations_channel,created_by,created_at)
      VALUES ($1,$2,'cipa-demo-1','ordinary',$3,$4,$4,'in_person','cipa-demo-m3','held','consensus',clock_timestamp(),'Quadro de avisos e e-mail','sst-demo-user',clock_timestamp())
      ON CONFLICT DO NOTHING`, [TENANT,id,seq,when]);
    for (const m of membros.slice(0,5)) {
      await c.query(`INSERT INTO sst.cipa_meeting_attendance (tenant_id,meeting_id,member_id,attendance,recorded_at)
        VALUES ($1,$2,$3,'present',clock_timestamp()) ON CONFLICT DO NOTHING`, [TENANT,id,m[0]]);
    }
    // ausência justificada de um membro na 4ª reunião
    if (seq === 4) {
      await c.query(`UPDATE sst.cipa_meeting_attendance SET attendance='absent_justified', justification='Atestado médico apresentado'
        WHERE tenant_id=$1 AND meeting_id=$2 AND member_id='cipa-demo-m4'`, [TENANT,id]);
    }
  }
  await c.query(`INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,modality,secretary_member_id,status,created_by,created_at)
    VALUES ($1,'cipa-demo-reu-5','cipa-demo-1','ordinary',5,'2026-11-10 14:00-03','hybrid','cipa-demo-m3','scheduled','sst-demo-user',clock_timestamp())
    ON CONFLICT DO NOTHING`, [TENANT]);

  // 5. Ata da última reunião, assinada
  const ataTexto = [
    "ATA DA 4ª REUNIÃO ORDINÁRIA DA CIPA — MANDATO 2026/2027",
    "",
    "Data: 13/10/2026 · Horário: 14h00 · Local: sala de treinamento da fábrica",
    "Presentes: presidente, vice-presidente, dois membros titulares e um suplente.",
    "Ausência justificada: membro representante do empregador (atestado médico).",
    "",
    "PAUTA E DELIBERAÇÕES",
    "1. Revisão do mapa de risco da área de solda: aprovada a inclusão de sinalização de piso molhado.",
    "2. EPI: identificado estoque mínimo de protetor auricular. Encaminhamento à área de compras.",
    "3. Treinamento de CIPA: os suplentes concluíram capacitação de 16 horas em 28/01/2026.",
    "4. Simulado de abandono: programado para novembro de 2026, junto com o PAE.",
    "",
    "Decisão registrada por consenso. Deliberações divulgadas em quadro de avisos e por e-mail.",
    "",
    "Documento de demonstração com dados fictícios."
  ].join("\n");
  await c.query(`INSERT INTO sst.cipa_minutes (tenant_id,id,meeting_id,revision,content,written_by,status,distributed_at,created_at)
    VALUES ($1,'cipa-demo-ata-1','cipa-demo-reu-4',1,$2,'cipa-demo-m3','final',clock_timestamp(),clock_timestamp())
    ON CONFLICT DO NOTHING`, [TENANT, ataTexto]);

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(ataTexto).digest("hex");
  for (const m of membros.slice(0,4)) {
    const worker = m[1];
    await c.query(`INSERT INTO sst.cipa_minute_signatures (tenant_id,minute_id,signer_kind,member_id,signer_name,signed_at,content_hash)
      VALUES ($1,'cipa-demo-ata-1','member',$2,$3,clock_timestamp(),$4) ON CONFLICT DO NOTHING`,
      [TENANT, m[0], worker.displayName, hash]);
  }

  // 6. Ações da reunião
  for (const [id, desc, resp, due, status] of [
    ["cipa-demo-ac-1","Incluir sinalização de piso molhado na área de solda","cipa-demo-m3","2026-11-10","in_progress"],
    ["cipa-demo-ac-2","Solicitar compra de protetor auricular ao almoxarifado","cipa-demo-m4","2026-11-10","open"],
    ["cipa-demo-ac-3","Agendar simulado de abandono com a brigada","cipa-demo-m2","2026-11-30","open"],
  ]) {
    await c.query(`INSERT INTO sst.cipa_actions (tenant_id,id,meeting_id,description,responsible_member_id,due_on,status,created_at)
      VALUES ($1,$2,'cipa-demo-reu-4',$3,$4,$5,$6,clock_timestamp()) ON CONFLICT DO NOTHING`,
      [TENANT,id,desc,resp,due,status]);
  }

  // 7. Eventos de auditoria da CIPA
  await c.query(`INSERT INTO sst.cipa_events (tenant_id,id,term_id,target_kind,target_id,action,actor_user_id,reason,occurred_at)
    VALUES ($1,'cipa-demo-ev-1','cipa-demo-1','term','cipa-demo-1','term.activated','sst-demo-user','Mandato ativado após posse em 02/02/2026',clock_timestamp())
    ON CONFLICT DO NOTHING`, [TENANT]);

  if (apply) {
    await c.query("COMMIT");
    console.log("CIPA de demonstração gravada.");
  } else {
    await c.query("ROLLBACK");
    console.log("Simulação concluída. Use --apply para gravar.");
  }

  const resumo = await c.query(`SELECT
    (SELECT count(*) FROM sst.cipa_terms WHERE tenant_id=$1) termos,
    (SELECT count(*) FROM sst.cipa_members WHERE tenant_id=$1) membros,
    (SELECT count(*) FROM sst.cipa_meetings WHERE tenant_id=$1) reunioes,
    (SELECT count(*) FROM sst.cipa_minutes WHERE tenant_id=$1) atas,
    (SELECT count(*) FROM sst.cipa_actions WHERE tenant_id=$1) acoes`, [TENANT]);
  console.log("estado atual:", JSON.stringify(resumo.rows[0]));
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("Falha:", error.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
