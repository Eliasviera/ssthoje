import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listAsoWorkers, listMedicalAsos, listAsoSummaries, saveAso, transitionAso, type AsoContent } from "../src/lib/aso-store.ts";
import { assignPcmso } from "../src/lib/pcmso-store.ts";
import { hasTenantPermission, getVisibleSections } from "../src/lib/tenant-access.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";

const original = process.cwd(), medico = "sst-demo-medico", admin = "sst-demo-user";
const scope = { companyId: "empresa-teste", unitId: "unidade-teste", companyName: "Empresa fictícia M10", unitName: "Unidade fictícia M10" };
function file(name: string) { return join(process.cwd(), "data", name); }
function write(name: string, value: unknown) { writeFileSync(file(name), JSON.stringify(value)); }
const worker = { id: "trabalhador-teste", tenantId: "tenant-horizonte", companyId: scope.companyId, unitId: scope.unitId, displayName: "Trabalhador fictício M10", jobTitle: "Função fictícia", status: "active", riskCategories: ["Categoria não enviada ao médico"], history: [{ privateMarker: "HISTORICO_NAO_ENVIADO" }] };
const content: AsoContent = { appointmentDate: "2026-10-09", reference: "REFERENCIA_RESTRITA", exams: [{ name: "EXAME_RESTRITO", date: "2026-10-09" }], fitness: "unrecorded" };
let id: string;
before(() => {
  mkdirSync(join(original, "data"), { recursive: true });
  process.chdir(mkdtempSync(join(original, "data", "aso-tests-")));
  mkdirSync(file("."), { recursive: true });
  write("clients.json", [{ id: scope.companyId, tenantId: "tenant-horizonte", tradeName: scope.companyName, legalName: scope.companyName, status: "active", units: [{ id: scope.unitId, name: scope.unitName }] }]);
  write("workers.json", [worker, { ...worker, id: "outro-trabalhador", unitId: "unidade-nao-vinculada" }, { ...worker, id: "trabalhador-aurora", tenantId: "tenant-aurora" }]);
});
after(() => process.chdir(original));

test("ASO: somente médico específico tem permissão e trabalhador requer vínculo", async () => {
  for (const role of ["consultoria_admin", "sst_tst", "profissional_habilitado", "cliente", "terceiro", "saas_master"]) assert.equal(hasTenantPermission(role, "aso.manage"), false);
  assert.equal(getVisibleSections("profissional_habilitado").includes("aso"), false);
  assert.equal(getVisibleSections("medico_coordenador").includes("aso"), true);
  for (const user of ["", "desconhecido", admin, "sst-demo-sst", "sst-demo-user-b"]) {
    await assert.rejects(() => listAsoWorkers(user)); await assert.rejects(() => listMedicalAsos(user));
    await assert.rejects(() => saveAso(user, worker.id, 0, content));
  }
  assert.deepEqual(await listAsoWorkers(medico), []);
  await assert.rejects(() => saveAso(medico, worker.id, 0, content), /Trabalhador indisponível/);
  assignPcmso(admin, scope, medico);
  const eligible = await listAsoWorkers(medico);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].workerId, worker.id);
  assert.equal(JSON.stringify(eligible).includes("HISTORICO_NAO_ENVIADO"), false);
  assert.equal("riskCategories" in eligible[0], false);
});
test("ASO: campos inválidos e datas impossíveis são rejeitados sem criar documento", async () => {
  const invalid: AsoContent[] = [
    { ...content, appointmentDate: "2026-02-30" }, { ...content, reference: " " },
    { ...content, fitness: "automatico" as AsoContent["fitness"] },
    { ...content, exams: [{ name: "", date: "2026-10-09" }] },
    { ...content, exams: [{ name: "Teste", date: "2026-13-01" }] },
    { ...content, exams: Array.from({ length: 11 }, () => ({ name: "Teste", date: "2026-10-09" })) },
  ];
  for (const input of invalid) await assert.rejects(() => saveAso(medico, worker.id, 0, input));
  assert.deepEqual(await listMedicalAsos(medico), []);
});
test("ASO: versões preservadas, seleção humana e bloqueio após envio/revisão", async () => {
  id = await saveAso(medico, worker.id, 0, content);
  await assert.rejects(() => transitionAso(medico, id, 1, "submit"), /aptidão/);
  await assert.rejects(() => transitionAso(medico, id, 1, "review"), /Envie/);
  await saveAso(medico, worker.id, 1, { ...content, fitness: "fit", reference: "REFERENCIA_RESTRITA_V2" }, id);
  await assert.rejects(() => saveAso(medico, worker.id, 1, content, id), /versão alterada/);
  const record = (await listMedicalAsos(medico))[0];
  assert.equal(record.revisions.length, 2);
  assert.equal(record.revisions[0].content.fitness, "unrecorded");
  assert.equal(record.revisions[1].content.fitness, "fit");
  record.revisions[0].content.reference = "adulterado";
  assert.equal((await listMedicalAsos(medico))[0].revisions[0].content.reference, content.reference);
  await transitionAso(medico, id, 2, "submit");
  await assert.rejects(() => saveAso(medico, worker.id, 2, content, id), /indisponível/);
  await transitionAso(medico, id, 2, "review");
  await assert.rejects(() => saveAso(medico, worker.id, 2, content, id), /indisponível/);
  await assert.rejects(() => transitionAso(medico, id, 2, "review"), /Envie/);
  assert.equal((await listMedicalAsos(medico))[0].status, "reviewed");
});
test("ASO: resposta administrativa e auditoria não contêm saúde nem versões de conteúdo", () => {
  for (const user of [admin, "sst-demo-sst"]) {
    const summaries = listAsoSummaries(user);
    assert.equal(summaries.length, 1);
    for (const key of ["content", "revisions", "history", "fitness", "reference", "exams", "appointmentDate"]) assert.equal(key in summaries[0], false);
    assert.equal(JSON.stringify(summaries).includes("RESTRIT"), false);
  }
  assert.deepEqual(listAsoSummaries("sst-demo-user-b"), []);
  assert.throws(() => listAsoSummaries(medico));
  const events = listAuditEventsForTenant("tenant-horizonte");
  assert.equal(events.some(e => e.action === "aso.read" && e.targetId === id), true);
  assert.equal(events.some(e => e.action === "aso.reviewed"), true);
  assert.equal(JSON.stringify(events).includes("RESTRIT"), false);
  assert.equal(JSON.stringify(events).includes('"fitness"'), false);
  assert.deepEqual(listAuditEventsForTenant("tenant-aurora"), []);
});
test("ASO: identificador forjado, troca de trabalhador e perda do vínculo são negados", async () => {
  await assert.rejects(() => saveAso(medico, "outro-trabalhador", 0, content), /Trabalhador indisponível/);
  await assert.rejects(() => saveAso(medico, "trabalhador-aurora", 0, content), /Trabalhador indisponível/);
  await assert.rejects(() => transitionAso(medico, "id-inexistente", 1, "review"), /indisponível/);
  const db = JSON.parse(readFileSync(file("aso.json"), "utf8"));
  db.records.push({ ...db.records[0], id: "ASO-AURORA", tenantId: "tenant-aurora" });
  write("aso.json", db);
  await assert.rejects(() => transitionAso(medico, "ASO-AURORA", 2, "review"), /indisponível/);
  assert.equal((await listMedicalAsos(medico)).length, 1);
  const pcmso = readFileSync(file("pcmso.json"), "utf8");
  write("pcmso.json", { records: [] });
  assert.deepEqual(await listMedicalAsos(medico), []);
  assert.deepEqual(await listAsoWorkers(medico), []);
  await assert.rejects(() => transitionAso(medico, id, 2, "review"), /Trabalhador indisponível/);
  writeFileSync(file("pcmso.json"), pcmso);
});
test("ASO: cadastro arquivado preserva histórico e bloqueia novas alterações", async () => {
  write("workers.json", [{ ...worker, status: "archived" }]);
  assert.deepEqual(await listAsoWorkers(medico), []);
  assert.equal((await listMedicalAsos(medico)).length, 1);
  await assert.rejects(() => saveAso(medico, worker.id, 0, content), /Trabalhador indisponível/);
  await assert.rejects(() => transitionAso(medico, id, 2, "review"), /Trabalhador indisponível/);
  write("workers.json", [worker]);
});
test("ASO: escopos assíncronos prevalecem sobre JSON e falha não grava", async () => {
  const before = readFileSync(file("aso.json"), "utf8");
  assert.equal((await listAsoWorkers(medico, async () => [scope])).length, 1);
  assert.deepEqual(await listAsoWorkers(medico, async () => []), []);
  assert.deepEqual(await listMedicalAsos(medico, async () => []), []);
  await assert.rejects(() => saveAso(medico, worker.id, 0, content, undefined, async () => { throw new Error("Fonte indisponível"); }), /Fonte indisponível/);
  assert.equal(readFileSync(file("aso.json"), "utf8"), before);
});

test("ASO: limite de alterações por usuário é aplicado no serviço", async () => {
  let limited = false;
  for (let i = 0; i < 31; i++) {
    try { await transitionAso(medico, "inexistente", 0, "review"); }
    catch (error) { if (error instanceof Error && error.message.includes("Muitas alterações")) { limited = true; break; } }
  }
  assert.equal(limited, true);
});
