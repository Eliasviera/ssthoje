import assert from "node:assert/strict";
import test from "node:test";
import { nextContractorAnnex, needsContractorRiskReview, type AnnexFields, type AnnexScope } from "../src/lib/pgr-contractor-annex.ts";
const scope: AnnexScope = { tenantId: "tenant-test", companyId: "company-test", unitId: "unit-test", sha256: "a".repeat(64) };
const fields: AnnexFields = { title: "Serviço fictício", contractor: "Contratada fictícia", activity: "Atividade sintética", location: "Área fictícia", startsOn: "2026-10-01", risks: "Perigos sintéticos informados", interference: "Interferências sintéticas", controls: "Medidas sintéticas", actionPlan: "Responsável e prazo sintéticos", evidence: "Fixture de teste", legalReferral: "", contractorType: "mei", participants: "owner_only", coverage: "not_covered" };
const input = { id: "a".repeat(36), scope, expectedRevision: 0, operation: "save" as const, fields, actorUserId: "actor-test", recordedAt: "2026-10-31T12:00:00Z", reason: "Registro sintético" };
test("serviço não contemplado gera aviso; rascunho exige revisão explícita", () => {
  assert.equal(needsContractorRiskReview("unknown"), true);
  assert.equal(needsContractorRiskReview("not_covered"), true);
  assert.equal(needsContractorRiskReview("covered"), false);
  const draft = nextContractorAnnex(undefined, input);
  assert.equal(draft.status, "draft");
  assert.throws(() => nextContractorAnnex(draft, { ...input, expectedRevision: 1, operation: "include" }), /Confirme/);
  const included = nextContractorAnnex(draft, { ...input, expectedRevision: 1, operation: "include", confirmed: true });
  assert.equal(included.status, "included"); assert.equal(draft.status, "draft");
});
test("inclusão recusa avaliação e participantes pendentes ou conteúdo incompleto", () => {
  for (const changes of [{ coverage: "unknown" }, { participants: "unknown" }, { risks: " " }, { controls: "" }, { evidence: "" }]) {
    const draft = nextContractorAnnex(undefined, { ...input, fields: { ...fields, ...changes } as AnnexFields });
    assert.throws(() => nextContractorAnnex(draft, { ...input, expectedRevision: 1, operation: "include", confirmed: true }), /Complete/);
  }
});
test("alteração de anexo incluído retorna a rascunho sem alterar versão anterior", () => {
  const draft = nextContractorAnnex(undefined, input);
  const included = nextContractorAnnex(draft, { ...input, operation: "include", expectedRevision: 1, confirmed: true });
  const edited = nextContractorAnnex(included, { ...input, expectedRevision: 2, fields: { ...fields, controls: "Nova medida sintética" } });
  assert.equal(edited.status, "draft"); assert.equal(included.fields.controls, fields.controls);
});
test("término exige confirmação, data real e registro de riscos remanescentes", () => {
  const draft = nextContractorAnnex(undefined, input);
  for (const endedOn of ["2026-09-30", "2026-11-01", "2026-02-30", ""]) {
    assert.throws(() => nextContractorAnnex(draft, { ...input, operation: "close", expectedRevision: 1, confirmed: true, endedOn, remainingActions: "Encaminhamento sintético" }), /término/);
  }
  assert.throws(() => nextContractorAnnex(draft, { ...input, operation: "close", expectedRevision: 1, confirmed: true, endedOn: "2026-10-31", remainingActions: " " }), /término/);
  const closed = nextContractorAnnex(draft, { ...input, operation: "close", expectedRevision: 1, confirmed: true, endedOn: "2026-10-31", remainingActions: "Pendência sintética mantida para acompanhamento" });
  assert.equal(closed.status, "closed"); assert.equal(closed.closure?.endedOn, "2026-10-31");
  assert.throws(() => nextContractorAnnex(closed, { ...input, expectedRevision: 2 }), /somente leitura/);
});
test("escopo divergente e revisão antiga não alteram o anexo", () => {
  const draft = nextContractorAnnex(undefined, input);
  for (const key of ["tenantId", "companyId", "unitId", "sha256"] as const) assert.throws(() => nextContractorAnnex(draft, { ...input, expectedRevision: 1, scope: { ...scope, [key]: "different" } }), /indisponível/);
  assert.throws(() => nextContractorAnnex(draft, input), /mudou/);
  assert.throws(() => nextContractorAnnex(undefined, { ...input, fields: { ...fields, startsOn: "2026-02-30" } }), /início válido/);
});
