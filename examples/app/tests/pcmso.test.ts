import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assignPcmso, changePcmso, listAssignedPcmso, listPcmsoSummaries } from "../src/lib/pcmso-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
import { hasTenantPermission, getVisibleSections } from "../src/lib/tenant-access.ts";

const original = process.cwd();
before(() => { mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "pcmso-tests-"))); });
after(() => process.chdir(original));
const scope = { companyId: "empresa-ficticia", unitId: "unidade-ficticia", companyName: "Empresa fictícia", unitName: "Unidade fictícia" };
const admin = "sst-demo-user", medico = "sst-demo-medico";

test("apenas o papel médico específico recebe permissão documental", () => {
  for (const role of ["consultoria_admin", "sst_tst", "profissional_habilitado", "cliente", "terceiro", "saas_master"]) {
    assert.equal(hasTenantPermission(role, "pcmso.manage"), false);
  }
  assert.equal(hasTenantPermission("medico_coordenador", "pcmso.manage"), true);
  assert.equal(getVisibleSections("profissional_habilitado").includes("pcmso"), false);
  assert.equal(getVisibleSections("medico_coordenador").includes("pcmso"), true);
});
test("sessão ausente, desconhecida e médico sem vínculo não recebem conteúdo", () => {
  assert.throws(() => listAssignedPcmso(""));
  assert.throws(() => listAssignedPcmso("desconhecido"));
  assert.deepEqual(listAssignedPcmso(medico), []);
  assert.throws(() => changePcmso(medico, "id-forjado", 0, "save", "texto"));
});
test("vínculo, versões, revisão e auditoria preservam conteúdo e isolamento", () => {
  assert.throws(() => assignPcmso("sst-demo-sst", scope, medico));
  assert.throws(() => assignPcmso("sst-demo-user-b", scope, medico));
  assert.throws(() => assignPcmso(admin, scope, "sst-demo-sst"));
  const record = assignPcmso(admin, scope, medico);
  assert.throws(() => changePcmso(medico, record.id, 0, "submit"));
  assert.throws(() => changePcmso(admin, record.id, 0, "save", "conteúdo forjado"));
  assert.throws(() => changePcmso("sst-demo-user-b", record.id, 0, "save", "conteúdo forjado"));
  assert.throws(() => changePcmso(medico, record.id, 0, "save", " "));
  assert.throws(() => changePcmso(medico, record.id, 0, "save", "x".repeat(12001)));
  changePcmso(medico, record.id, 0, "save", "MARCADOR_RESTRITO_V1");
  assert.throws(() => changePcmso(medico, record.id, 0, "save", "versão desatualizada"));
  changePcmso(medico, record.id, 1, "save", "MARCADOR_RESTRITO_V2");
  const full = listAssignedPcmso(medico)[0];
  assert.deepEqual(full.revisions.map(r => r.content), ["MARCADOR_RESTRITO_V1", "MARCADOR_RESTRITO_V2"]);
  full.revisions[0].content = "adulterado";
  assert.equal(listAssignedPcmso(medico)[0].revisions[0].content, "MARCADOR_RESTRITO_V1");
  for (const user of [admin, "sst-demo-sst"]) {
    const response = listPcmsoSummaries(user);
    assert.equal(response.length, 1);
    assert.equal(JSON.stringify(response).includes("MARCADOR_RESTRITO"), false);
    for (const key of ["content", "revisions", "history", "tenantId"]) assert.equal(key in response[0], false);
    assert.throws(() => listAssignedPcmso(user));
  }
  assert.deepEqual(listPcmsoSummaries("sst-demo-user-b"), []);
  assert.throws(() => listPcmsoSummaries(medico));
  assert.throws(() => changePcmso(medico, record.id, 2, "review"));
  changePcmso(medico, record.id, 2, "submit");
  assert.throws(() => changePcmso(medico, record.id, 2, "save", "edição indevida"));
  changePcmso(medico, record.id, 2, "review");
  assert.equal(listAssignedPcmso(medico)[0].status, "reviewed");
  assert.throws(() => changePcmso(medico, record.id, 2, "save", "edição indevida"));
  assert.throws(() => changePcmso(medico, record.id, 2, "review"));
  const events = listAuditEventsForTenant("tenant-horizonte");
  assert.equal(events.some(e => e.action === "pcmso.read" && e.targetId === record.id), true);
  assert.equal(events.some(e => e.action === "pcmso.reviewed"), true);
  assert.equal(JSON.stringify(events).includes("MARCADOR_RESTRITO"), false);
  assert.deepEqual(listAuditEventsForTenant("tenant-aurora"), []);
});

test("identificador direto não contorna o vínculo médico ou a consultoria", () => {
  // Fixtures adversariais: papel médico válido, mas registro de outro responsável/tenant.
  const path = join(process.cwd(), "data", "pcmso.json");
  const db = JSON.parse(readFileSync(path, "utf8"));
  const base = db.records[0];
  db.records.push({ ...base, id: "nao-vinculado", coordinatorId: "outro-medico-ficticio", status: "draft", content: "SEGREDO_NAO_VINCULADO" });
  db.records.push({ ...base, id: "outra-consultoria", tenantId: "tenant-aurora", coordinatorId: medico, status: "draft", content: "SEGREDO_OUTRA_CONSULTORIA" });
  writeFileSync(path, JSON.stringify(db));
  const response = JSON.stringify(listAssignedPcmso(medico));
  assert.equal(response.includes("SEGREDO_NAO_VINCULADO"), false);
  assert.equal(response.includes("SEGREDO_OUTRA_CONSULTORIA"), false);
  for (const id of ["nao-vinculado", "outra-consultoria"]) {
    for (const operation of ["save", "submit", "review"] as const) {
      assert.throws(() => changePcmso(medico, id, base.version, operation, "tentativa indevida"));
    }
  }
});
