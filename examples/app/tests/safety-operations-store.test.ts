import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSafetyApr,
  createSafetyChecklistTemplate,
  activateSafetyChecklistTemplate,
  listSafetyAprs,
  listSafetyChecklistTemplates,
  saveSafetyAprAnswers,
  submitSafetyAprForReview,
} from "../src/lib/safety-operations-store.ts";

const originalDirectory = process.cwd();
let testDirectory = "";
before(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "sst-safety-operations-tests-"));
  mkdirSync(join(testDirectory, "data"));
  process.chdir(testDirectory);
});
after(() => {
  process.chdir(originalDirectory);
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
});

test("versiona modelos sem apagar checklist anterior nem atravessar tenant", () => {
  const first = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Inspeção de demonstração", activity: "Atividade fictícia",
    prompts: ["Conferir a área", "Confirmar comunicação"], previousTemplateId: "", createdBy: "user-a",
  });
  assert.equal(first.status, "draft");
  assert.throws(() => createSafetyApr({
    tenantId: "tenant-a", title: "APR antes da revisão", companyId: "company-a", unitId: "unit-a",
    activityStage: "Etapa", workArea: "Área", responsible: "Responsável",
    pgrInventoryId: "pgr-a", pgrRevision: 1, pgrTitle: "PGR",
    risks: [{ inventoryId: "pgr-a", inventoryRevision: 1, riskId: "risk-a", activity: "Atividade", hazard: "Perigo", possibleHarm: "", exposureDescription: "" }],
    checklistTemplateId: first.id, checklistTemplateVersion: first.version, createdBy: "user-a",
  }), /modelo de checklist ativo/);
  activateSafetyChecklistTemplate("tenant-a", first.id, "reviewer-a");
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === first.id)?.status, "active");
  const second = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: first.title, activity: first.activity,
    prompts: ["Conferir a área revisada"], previousTemplateId: first.id, createdBy: "user-a",
  });

  assert.equal(second.version, 2);
  assert.equal(second.status, "draft");
  assert.equal(second.previousTemplateId, first.id);
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === first.id)?.status, "active");
  activateSafetyChecklistTemplate("tenant-a", second.id, "reviewer-a");
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === first.id)?.status, "superseded");
  assert.equal(listSafetyChecklistTemplates("tenant-b").length, 0);
  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-b", title: first.title, activity: first.activity,
    prompts: ["Item"], previousTemplateId: first.id, createdBy: "user-b",
  }), /não está disponível nesta consultoria/);
});

test("impede duplicar um modelo ativo ou abrir duas versões pendentes do mesmo modelo", () => {
  const first = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo controlado", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta informada pela equipe"], previousTemplateId: "", createdBy: "user-a",
  });
  activateSafetyChecklistTemplate("tenant-a", first.id, "reviewer-a");

  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: first.title, activity: first.activity,
    prompts: ["Outra pergunta"], previousTemplateId: "", createdBy: "user-a",
  }), /Já existe um modelo/);

  const pendingVersion = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: first.title, activity: first.activity,
    prompts: ["Pergunta atualizada pela equipe"], previousTemplateId: first.id, createdBy: "user-a",
  });
  assert.equal(pendingVersion.version, 2);
  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: first.title, activity: first.activity,
    prompts: ["Outra pergunta atualizada"], previousTemplateId: first.id, createdBy: "user-a",
  }), /Já existe uma versão em rascunho/);

  const templates = listSafetyChecklistTemplates("tenant-a");
  assert.equal(templates.filter((template) => template.title === first.title).length, 2);
  assert.equal(templates.find((template) => template.id === first.id)?.status, "active");
  assert.equal(templates.find((template) => template.id === pendingVersion.id)?.status, "draft");
});

test("limita estrutura editável a 50 perguntas de até 300 caracteres", () => {
  const maximum = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Estrutura no limite", activity: "Atividade definida pela equipe",
    prompts: Array.from({ length: 50 }, () => "P".repeat(300)), previousTemplateId: "", createdBy: "user-a",
  });
  assert.equal(maximum.items.length, 50);
  assert.ok(maximum.items.every((item) => item.prompt.length === 300));

  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Estrutura acima do limite", activity: "Atividade definida pela equipe",
    prompts: Array.from({ length: 51 }, () => "Pergunta organizacional"), previousTemplateId: "", createdBy: "user-a",
  }), /1 a 50 itens válidos/);
  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Pergunta longa", activity: "Atividade definida pela equipe",
    prompts: ["P".repeat(301)], previousTemplateId: "", createdBy: "user-a",
  }), /1 a 50 itens válidos/);
});

test("rejeita datas de referência impossíveis ou com vigência final anterior à inicial", () => {
  const baseReference = {
    title: "Referência informada pela equipe",
    version: "Edição informada",
    jurisdiction: "Âmbito informado",
    validFrom: "2026-01-01",
    validUntil: "",
    reviewer: "Responsável informado",
  };
  const before = listSafetyChecklistTemplates("tenant-a").length;

  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Data inicial impossível", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta organizacional"], previousTemplateId: "", createdBy: "user-a",
    reference: { ...baseReference, validFrom: "2026-02-30" },
  }), /fonte e a vigência/);
  assert.throws(() => createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Período invertido", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta organizacional"], previousTemplateId: "", createdBy: "user-a",
    reference: { ...baseReference, validUntil: "2025-12-31" },
  }), /fonte e a vigência/);

  assert.equal(listSafetyChecklistTemplates("tenant-a").length, before);
});

test("normaliza espaços e aplica os limites da interface aos metadados da referência", () => {
  const normalized = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Referência normalizada", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta organizacional"], previousTemplateId: "", createdBy: "user-a",
    reference: {
      title: "  Fonte informada  ",
      version: "  Edição informada  ",
      jurisdiction: "  Âmbito informado  ",
      validFrom: " 2026-01-01 ",
      validUntil: "",
      reviewer: "  Responsável informado  ",
    },
  });
  assert.deepEqual(normalized.reference, {
    title: "Fonte informada",
    version: "Edição informada",
    jurisdiction: "Âmbito informado",
    validFrom: "2026-01-01",
    validUntil: "",
    reviewer: "Responsável informado",
  });

  const before = listSafetyChecklistTemplates("tenant-a").length;
  for (const [key, max] of [["title", 180], ["version", 80], ["jurisdiction", 100], ["reviewer", 120]] as const) {
    assert.throws(() => createSafetyChecklistTemplate({
      tenantId: "tenant-a", title: `Referência longa ${key}`, activity: "Atividade definida pela equipe",
      prompts: ["Pergunta organizacional"], previousTemplateId: "", createdBy: "user-a",
      reference: {
        title: "Fonte informada",
        version: "Edição informada",
        jurisdiction: "Âmbito informado",
        validFrom: "2026-01-01",
        validUntil: "",
        reviewer: "Responsável informado",
        [key]: "X".repeat(max + 1),
      },
    }), /fonte e a vigência/);
  }
  assert.equal(listSafetyChecklistTemplates("tenant-a").length, before);
});

test("ativação rejeita metadados de referência corrompidos após a criação do rascunho", () => {
  const activeTemplate = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo com referência", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta da versão ativa"], previousTemplateId: "", createdBy: "user-a",
  });
  activateSafetyChecklistTemplate("tenant-a", activeTemplate.id, "reviewer-a");
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo com referência", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta da nova versão"], previousTemplateId: activeTemplate.id, createdBy: "user-a",
    reference: {
      title: "Fonte informada",
      version: "Edição informada",
      jurisdiction: "Âmbito informado",
      validFrom: "2026-01-01",
      validUntil: "",
      reviewer: "Responsável informado",
    },
  });
  const dataPath = join(process.cwd(), "data", "safety-operations.json");
  const stored = JSON.parse(readFileSync(dataPath, "utf8")) as {
    templates: Array<{ id: string; reference?: { title: string } }>;
    aprs: unknown[];
  };
  const storedDraft = stored.templates.find((template) => template.id === draft.id);
  assert.ok(storedDraft?.reference);
  storedDraft.reference.title = "X".repeat(181);
  writeFileSync(dataPath, JSON.stringify(stored), "utf8");

  assert.throws(() => activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a"), /fonte.*vigência/i);
  const templates = listSafetyChecklistTemplates("tenant-a");
  assert.equal(templates.find((template) => template.id === draft.id)?.status, "draft");
  assert.equal(templates.find((template) => template.id === activeTemplate.id)?.status, "active");
});

test("APR guarda snapshots do PGR e do checklist usados no rascunho", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo", activity: "Montagem",
    prompts: ["A área foi conferida?"], previousTemplateId: "", createdBy: "user-a",
  });
  const template = activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a");
  const apr = createSafetyApr({
    tenantId: "tenant-a", title: "APR de demonstração", companyId: "company-a", unitId: "unit-a",
    activityStage: "Etapa fictícia", workArea: "Área de teste", responsible: "Responsável fictício",
    pgrInventoryId: "pgr-a", pgrRevision: 3, pgrTitle: "PGR aprovado",
    risks: [{ inventoryId: "pgr-a", inventoryRevision: 3, riskId: "risk-a", activity: "Montagem", hazard: "Queda", possibleHarm: "Lesão", exposureDescription: "Informação revisada pela equipe" }],
    checklistTemplateId: template.id, checklistTemplateVersion: template.version, createdBy: "user-a",
  });
  const detached = listSafetyAprs("tenant-a")[0];
  detached.risks[0].hazard = "Alteração externa";

  assert.equal(apr.status, "draft");
  assert.equal(apr.checklistTitle, "Modelo");
  assert.equal(apr.answers[0].prompt, "A área foi conferida?");
  assert.equal(listSafetyAprs("tenant-a")[0].risks[0].hazard, "Queda");
  assert.equal(listSafetyAprs("tenant-b").length, 0);

  const revisedDraft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: template.title, activity: template.activity,
    prompts: ["Pergunta da nova versão"], previousTemplateId: template.id, createdBy: "user-a",
  });
  activateSafetyChecklistTemplate("tenant-a", revisedDraft.id, "reviewer-a");

  const historicalApr = listSafetyAprs("tenant-a").find((item) => item.id === apr.id);
  assert.ok(historicalApr);
  assert.equal(historicalApr.checklistTemplateVersion, 1);
  assert.equal(historicalApr.checklistTitle, "Modelo");
  assert.equal(historicalApr.answers[0].prompt, "A área foi conferida?");
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === template.id)?.status, "superseded");
});

test("APR mantém riscos do PGR e registra riscos/controles adicionais separadamente", () => {
  const tenantId = "tenant-apr-additional";
  const draft = createSafetyChecklistTemplate({
    tenantId, title: "Modelo com adicionais", activity: "Atividade sintética",
    prompts: ["Pergunta sintética"], previousTemplateId: "", createdBy: "author-test",
  });
  const template = activateSafetyChecklistTemplate(tenantId, draft.id, "reviewer-test");
  const apr = createSafetyApr({
    tenantId, title: "APR com riscos adicionais", companyId: "company-test", unitId: "unit-test",
    activityStage: "Etapa sintética", workArea: "Área sintética", responsible: "Pessoa fictícia",
    pgrInventoryId: "pgr-test", pgrRevision: 2, pgrTitle: "PGR sintético",
    risks: [{ inventoryId: "pgr-test", inventoryRevision: 2, riskId: "risk-pgr-1", activity: "Atividade sintética", hazard: "Perigo do PGR", possibleHarm: "", exposureDescription: "" }],
    additionalRisks: [
      { hazard: "  Queda de objeto durante a montagem  ", possibleHarm: "  Fratura  ", identificationBasis: "  Observação da condição real  ", controls: ["  Isolar a área abaixo  ", " ", "  Usar retenção de ferramentas  "] },
    ],
    additionalPgrControls: [{ riskId: "risk-pgr-1", description: "  Proteção adicional definida na tarefa  " }],
    checklistTemplateId: template.id, checklistTemplateVersion: template.version, createdBy: "author-test",
  });

  assert.equal(apr.additionalRisks?.length, 1);
  assert.equal(apr.additionalRisks?.[0].hazard, "Queda de objeto durante a montagem");
  assert.equal(apr.additionalRisks?.[0].possibleHarm, "Fratura");
  assert.equal(apr.additionalRisks?.[0].identificationBasis, "Observação da condição real");
  assert.deepEqual(apr.additionalRisks?.[0].controls, ["Isolar a área abaixo", "Usar retenção de ferramentas"]);
  assert.ok(apr.additionalRisks?.[0].id);
  assert.equal(apr.additionalPgrControls?.length, 1);
  assert.equal(apr.additionalPgrControls?.[0].riskId, "risk-pgr-1");
  assert.equal(apr.additionalPgrControls?.[0].description, "Proteção adicional definida na tarefa");
  assert.equal(apr.risks[0].riskId, "risk-pgr-1");

  const listed = listSafetyAprs(tenantId).find(item => item.id === apr.id)!;
  listed.additionalRisks![0].hazard = "Mutação externa";
  listed.additionalRisks![0].controls[0] = "Mutação externa";
  listed.additionalPgrControls![0].description = "Mutação externa";
  const fresh = listSafetyAprs(tenantId).find(item => item.id === apr.id)!;
  assert.equal(fresh.additionalRisks?.[0].hazard, "Queda de objeto durante a montagem");
  assert.equal(fresh.additionalRisks?.[0].controls[0], "Isolar a área abaixo");
  assert.equal(fresh.additionalPgrControls?.[0].description, "Proteção adicional definida na tarefa");
  assert.equal(listSafetyAprs("tenant-apr-additional-other").length, 0);
});

test("risco adicional exige origem e controle, e medida adicional exige risco selecionado do PGR", () => {
  const tenantId = "tenant-apr-additional-invalid";
  const draft = createSafetyChecklistTemplate({
    tenantId, title: "Modelo de validação adicional", activity: "Atividade sintética",
    prompts: ["Pergunta sintética"], previousTemplateId: "", createdBy: "author-test",
  });
  const template = activateSafetyChecklistTemplate(tenantId, draft.id, "reviewer-test");
  const base = {
    tenantId, title: "APR inválida", companyId: "company-test", unitId: "unit-test",
    activityStage: "Etapa sintética", workArea: "Área sintética", responsible: "Pessoa fictícia",
    pgrInventoryId: "pgr-test", pgrRevision: 1, pgrTitle: "PGR sintético",
    risks: [{ inventoryId: "pgr-test", inventoryRevision: 1, riskId: "risk-pgr-1", activity: "Atividade sintética", hazard: "Perigo do PGR", possibleHarm: "", exposureDescription: "" }],
    checklistTemplateId: template.id, checklistTemplateVersion: template.version, createdBy: "author-test",
  };
  const before = listSafetyAprs(tenantId).length;

  assert.throws(() => createSafetyApr({ ...base,
    additionalRisks: [{ hazard: "Perigo adicional", possibleHarm: "", identificationBasis: "Observação", controls: [] }],
  }), /risco adicional precisa/);
  assert.throws(() => createSafetyApr({ ...base,
    additionalRisks: [{ hazard: "Perigo adicional", possibleHarm: "", identificationBasis: "", controls: ["Controle"] }],
  }), /risco adicional precisa/);
  assert.throws(() => createSafetyApr({ ...base,
    additionalRisks: [
      { hazard: "Perigo repetido", possibleHarm: "", identificationBasis: "Observação", controls: ["Controle"] },
      { hazard: " perigo repetido ", possibleHarm: "", identificationBasis: "Outra observação", controls: ["Outro controle"] },
    ],
  }), /risco adicional foi repetido/);
  assert.throws(() => createSafetyApr({ ...base,
    additionalPgrControls: [{ riskId: "risk-nao-selecionado", description: "Medida adicional" }],
  }), /medida adicional precisa/);
  assert.throws(() => createSafetyApr({ ...base,
    additionalPgrControls: [{ riskId: "risk-pgr-1", description: " " }],
  }), /medida adicional precisa/);
  assert.equal(listSafetyAprs(tenantId).length, before);
});

test("APR exige revisão esperada e resposta completa antes do envio", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo de revisão", activity: "Montagem",
    prompts: ["Checagem 1", "Checagem 2"], previousTemplateId: "", createdBy: "user-a",
  });
  const template = activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a");
  const apr = createSafetyApr({
    tenantId: "tenant-a", title: "APR", companyId: "company-a", unitId: "unit-a",
    activityStage: "Etapa", workArea: "Área", responsible: "Responsável",
    pgrInventoryId: "pgr-a", pgrRevision: 1, pgrTitle: "PGR",
    risks: [{ inventoryId: "pgr-a", inventoryRevision: 1, riskId: "risk-a", activity: "Atividade", hazard: "Perigo", possibleHarm: "", exposureDescription: "" }],
    checklistTemplateId: template.id, checklistTemplateVersion: 1, createdBy: "user-a",
  });
  const answers = apr.answers.map((answer, index) => ({
    id: answer.id, result: index === 0 ? "not_applicable" as const : "attention" as const,
    notes: index === 0 ? "Justificativa" : "Condição identificada",
    nextStep: index === 0 ? "" : "Revisar medida",
    responsible: index === 0 ? "" : "Responsável fictício",
  }));
  const saved = saveSafetyAprAnswers("tenant-a", apr.id, 1, answers, "editor-test");

  assert.equal(saved.revision, 2);
  assert.throws(() => saveSafetyAprAnswers("tenant-a", apr.id, 1, answers, "editor-test"), /alterada em outra sessão/);
  const submitted = submitSafetyAprForReview("tenant-a", apr.id, 2, "reviewer-a");
  assert.equal(submitted.status, "in_review");
  assert.equal(submitted.revision, 3);
  assert.throws(() => saveSafetyAprAnswers("tenant-a", apr.id, 3, answers, "editor-test"), /não está disponível para edição/);
  assert.deepEqual(submitted.history?.map(entry => entry.action), ["created", "saved", "submitted"]);
  assert.deepEqual(submitted.history?.map(entry => entry.actorUserId), ["user-a", "editor-test", "reviewer-a"]);
  assert.equal(submitted.history?.[0].answers[0].result, "unanswered");
  assert.equal(submitted.history?.[1].answers[0].result, "not_applicable");
  assert.deepEqual(submitted.history?.map(entry => entry.revision), [1, 2, 3]);
});

test("APR não envia item não aplicável sem justificativa nem pendência sem plano", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo de validação", activity: "Montagem",
    prompts: ["Checagem"], previousTemplateId: "", createdBy: "user-a",
  });
  const template = activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a");
  const apr = createSafetyApr({
    tenantId: "tenant-a", title: "APR", companyId: "company-a", unitId: "unit-a",
    activityStage: "Etapa", workArea: "Área", responsible: "Responsável",
    pgrInventoryId: "pgr-a", pgrRevision: 1, pgrTitle: "PGR",
    risks: [{ inventoryId: "pgr-a", inventoryRevision: 1, riskId: "risk-a", activity: "Atividade", hazard: "Perigo", possibleHarm: "", exposureDescription: "" }],
    checklistTemplateId: template.id, checklistTemplateVersion: 1, createdBy: "user-a",
  });
  const base = { id: apr.answers[0].id, nextStep: "", responsible: "", notes: "" };
  const notApplicable = saveSafetyAprAnswers("tenant-a", apr.id, 1, [{ ...base, result: "not_applicable" }], "editor-test");
  assert.throws(() => submitSafetyAprForReview("tenant-a", apr.id, notApplicable.revision, "reviewer-a"), /Itens não aplicáveis exigem justificativa/);

  const issue = saveSafetyAprAnswers("tenant-a", apr.id, notApplicable.revision, [{ ...base, result: "attention", notes: "Ponto identificado" }], "editor-test");
  assert.throws(() => submitSafetyAprForReview("tenant-a", apr.id, issue.revision, "reviewer-a"), /Pontos a tratar exigem descrição, próximo passo e responsável/);
});

test("nova APR não aceita checklist de outro tenant nem versão inativa", () => {
  const foreignTemplate = createSafetyChecklistTemplate({
    tenantId: "tenant-b", title: "Modelo", activity: "Montagem",
    prompts: ["Checagem"], previousTemplateId: "", createdBy: "user-b",
  });
  activateSafetyChecklistTemplate("tenant-b", foreignTemplate.id, "reviewer-b");
  assert.throws(() => createSafetyApr({
    tenantId: "tenant-a", title: "APR", companyId: "company-a", unitId: "unit-a",
    activityStage: "Etapa", workArea: "Área", responsible: "Responsável",
    pgrInventoryId: "pgr-a", pgrRevision: 1, pgrTitle: "PGR",
    risks: [{ inventoryId: "pgr-a", inventoryRevision: 1, riskId: "risk-a", activity: "Atividade", hazard: "Perigo", possibleHarm: "", exposureDescription: "" }],
    checklistTemplateId: foreignTemplate.id, checklistTemplateVersion: 1, createdBy: "user-a",
  }), /modelo de checklist ativo/);
});

test("modelo de espaço confinado exige referência NR-33 completa antes de ativar", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", activityKind: "confined_space_nr33", title: "Modelo espaço confinado",
    activity: "Atividade definida pela equipe", prompts: ["Item informado pela equipe"],
    previousTemplateId: "", createdBy: "user-a",
  });
  assert.throws(() => activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a"), /referência NR-33/);
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === draft.id)?.status, "draft");
});

test("nova versão sem referência mantém ativa a versão anterior de espaço confinado", () => {
  const previous = createSafetyChecklistTemplate({
    tenantId: "tenant-a", activityKind: "confined_space_nr33", title: "Modelo de espaço confinado",
    activity: "Atividade definida pela equipe", prompts: ["Pergunta informada pela equipe"],
    previousTemplateId: "", createdBy: "user-a",
    reference: {
      title: "NR-33 — referência sintética de teste",
      version: "Edição fictícia de teste",
      jurisdiction: "Âmbito sintético",
      validFrom: "2026-01-01",
      validUntil: "",
      reviewer: "Revisor de teste",
    },
  });
  activateSafetyChecklistTemplate("tenant-a", previous.id, "reviewer-a");
  const next = createSafetyChecklistTemplate({
    tenantId: "tenant-a", activityKind: previous.activityKind, title: previous.title,
    activity: previous.activity, prompts: ["Pergunta revisada pela equipe"],
    previousTemplateId: previous.id, createdBy: "user-a",
  });

  assert.throws(() => activateSafetyChecklistTemplate("tenant-a", next.id, "reviewer-a"), /referência NR-33/);
  const templates = listSafetyChecklistTemplates("tenant-a");
  assert.equal(templates.find((template) => template.id === previous.id)?.status, "active");
  assert.equal(templates.find((template) => template.id === next.id)?.status, "draft");
});

test("ativação do modelo exige identificação da pessoa revisora", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo de atividade", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta informada pela equipe"], previousTemplateId: "", createdBy: "user-a",
  });
  assert.throws(() => activateSafetyChecklistTemplate("tenant-a", draft.id, ""), /revisão humana/);
  assert.equal(listSafetyChecklistTemplates("tenant-a").find((item) => item.id === draft.id)?.status, "draft");
});

test("modelo genérico é ativado por revisão humana sem vínculo a PGR", () => {
  const aprCountBeforeActivation = listSafetyAprs("tenant-a").length;
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", title: "Modelo reutilizável", activity: "Atividade definida pela equipe",
    prompts: ["Pergunta informada pela equipe"], previousTemplateId: "", createdBy: "user-a",
  });

  const active = activateSafetyChecklistTemplate("tenant-a", draft.id, "reviewer-a");

  assert.equal(active.status, "active");
  assert.equal(active.reviewedBy, "reviewer-a");
  assert.equal("pgrInventoryId" in active, false);
  assert.equal(listSafetyAprs("tenant-a").length, aprCountBeforeActivation);
});

test("ativação registra revisão autenticada e valida metadados da NR-33", () => {
  const draft = createSafetyChecklistTemplate({
    tenantId: "tenant-a", activityKind: "confined_space_nr33", title: "Modelo espaço confinado revisado",
    activity: "Atividade definida pela equipe", prompts: ["Item informado pela equipe"],
    previousTemplateId: "", createdBy: "user-a",
    reference: {
      title: "NR-33 — referência a validar", version: "edição informada pela equipe",
      jurisdiction: "Brasil", validFrom: "2026-01-01", validUntil: "", reviewer: "Revisor informado",
    },
  });
  const active = activateSafetyChecklistTemplate("tenant-a", draft.id, "authenticated-reviewer-id");
  assert.equal(active.status, "active");
  assert.equal(active.reviewedBy, "authenticated-reviewer-id");
  assert.ok(active.reviewedAt);
  assert.throws(() => activateSafetyChecklistTemplate("tenant-a", draft.id, "authenticated-reviewer-id"), /rascunho do checklist/);
});

test("ativação revalida perguntas persistidas sem substituir versão ativa em caso de corrupção", () => {
  const first = createSafetyChecklistTemplate({ tenantId: "tenant-structural", title: "Modelo sintético estrutural", activity: "Atividade fictícia", prompts: ["Pergunta original"], previousTemplateId: "", createdBy: "user-test" });
  activateSafetyChecklistTemplate("tenant-structural", first.id, "reviewer-test");
  const draft = createSafetyChecklistTemplate({ tenantId: "tenant-structural", title: first.title, activity: first.activity, prompts: ["Pergunta revisada", "Outra pergunta"], previousTemplateId: first.id, createdBy: "user-test" });
  const path = join(process.cwd(), "data", "safety-operations.json");
  const original = readFileSync(path, "utf8");
  const changes = [
    (t: typeof draft) => { t.items[0].prompt = " "; },
    (t: typeof draft) => { t.items[0].prompt = "x".repeat(301); },
    (t: typeof draft) => { t.items[1].id = t.items[0].id; },
    (t: typeof draft) => { t.items[0].id = ""; },
    (t: typeof draft) => { t.items = []; },
    (t: typeof draft) => { t.title = "Modelo trocado"; },
    (t: typeof draft) => { t.activity = "Atividade trocada"; },
    (t: typeof draft) => { t.version = 4; },
    (t: typeof draft) => { t.activityKind = "categoria-inexistente" as typeof draft.activityKind; },
  ];
  try {
    for (const change of changes) {
      const stored = JSON.parse(original) as { templates: typeof draft[] };
      change(stored.templates.find(t => t.id === draft.id)!);
      writeFileSync(path, JSON.stringify(stored), "utf8");
      const before = readFileSync(path, "utf8");
      assert.throws(() => activateSafetyChecklistTemplate("tenant-structural", draft.id, "reviewer-test"), /perguntas válidas|identidade do modelo|categoria e versão/);
      assert.equal(readFileSync(path, "utf8"), before);
      const saved = JSON.parse(readFileSync(path, "utf8")) as { templates: typeof draft[] };
      assert.equal(saved.templates.find(t => t.id === first.id)?.status, "active");
      assert.equal(saved.templates.find(t => t.id === draft.id)?.status, "draft");
    }
  } finally { writeFileSync(path, original, "utf8"); }
  const activated = activateSafetyChecklistTemplate("tenant-structural", draft.id, "reviewer-test");
  assert.equal(activated.version, 2);
  assert.equal(activated.status, "active");
});

test("APR preserva referência e revisão humana do modelo sem reconstruir snapshots legados", () => {
  const tenantId = "tenant-checklist-snapshot";
  const reference = { title: "Fonte sintética", version: "Edição fictícia 1", jurisdiction: "Âmbito de teste", validFrom: "2026-01-01", validUntil: "", reviewer: "Pessoa fictícia revisora" };
  const draft = createSafetyChecklistTemplate({ tenantId, title: "Modelo snapshot completo", activity: "Atividade sintética", prompts: ["Pergunta sintética original"], previousTemplateId: "", createdBy: "author-test", reference });
  const template = activateSafetyChecklistTemplate(tenantId, draft.id, "reviewer-test-v1");
  const apr = createSafetyApr({ tenantId, title: "APR sintética", companyId: "company-test", unitId: "unit-test", activityStage: "Etapa sintética", workArea: "Local sintético", responsible: "Responsável fictício", pgrInventoryId: "pgr-test", pgrRevision: 1, pgrTitle: "PGR de teste", risks: [{ inventoryId: "pgr-test", inventoryRevision: 1, riskId: "risk-test", activity: "Atividade sintética", hazard: "Perigo sintético", possibleHarm: "", exposureDescription: "" }], checklistTemplateId: template.id, checklistTemplateVersion: 1, createdBy: "author-test" });
  assert.deepEqual(apr.checklistSnapshot, template);
  const next = createSafetyChecklistTemplate({ tenantId, title: template.title, activity: template.activity, prompts: ["Pergunta sintética revisada"], previousTemplateId: template.id, createdBy: "author-test", reference: { ...reference, version: "Edição fictícia 2" } });
  activateSafetyChecklistTemplate(tenantId, next.id, "reviewer-test-v2");
  const historical = listSafetyAprs(tenantId).find(item => item.id === apr.id)!;
  assert.equal(historical.checklistSnapshot?.reference?.version, reference.version);
  assert.equal(historical.checklistSnapshot?.reviewedBy, "reviewer-test-v1");
  assert.equal(historical.checklistSnapshot?.reviewedAt, template.reviewedAt);
  assert.equal(historical.checklistSnapshot?.items[0].prompt, "Pergunta sintética original");
  historical.checklistSnapshot!.reference!.title = "Mutação externa";
  historical.checklistSnapshot!.items[0].prompt = "Mutação externa";
  assert.equal(listSafetyAprs(tenantId)[0].checklistSnapshot?.reference?.title, reference.title);
  assert.equal(listSafetyAprs(tenantId)[0].checklistSnapshot?.items[0].prompt, "Pergunta sintética original");
  const path = join(process.cwd(), "data", "safety-operations.json");
  const stored = JSON.parse(readFileSync(path, "utf8")) as { aprs: typeof apr[] };
  delete stored.aprs.find(item => item.id === apr.id)!.checklistSnapshot;
  writeFileSync(path, JSON.stringify(stored), "utf8");
  const legacy = listSafetyAprs(tenantId).find(item => item.id === apr.id)!;
  assert.equal(legacy.checklistSnapshot, undefined);
  assert.equal(legacy.answers[0].prompt, "Pergunta sintética original");
  assert.equal(legacy.checklistTemplateVersion, 1);
  const savedLegacy = saveSafetyAprAnswers(tenantId, legacy.id, legacy.revision,
    legacy.answers.map(answer => ({ id: answer.id, result: "observed" as const, notes: "Observação fictícia", nextStep: "", responsible: "" })), "editor-test");
  const submittedLegacy = submitSafetyAprForReview(tenantId, legacy.id, savedLegacy.revision, "reviewer-test");
  assert.equal(submittedLegacy.status, "in_review");
  assert.equal(submittedLegacy.checklistSnapshot, undefined);
});

test("salvar/enviar recusa checklist persistido inconsistente sem alterar APR nem snapshot", () => {
  const tenantId = "tenant-integrity-test";
  const draft = createSafetyChecklistTemplate({ tenantId, title: "Modelo integridade", activity: "Atividade sintética", prompts: ["Pergunta sintética 1", "Pergunta sintética 2"], previousTemplateId: "", createdBy: "author-test" });
  const template = activateSafetyChecklistTemplate(tenantId, draft.id, "reviewer-test");
  const apr = createSafetyApr({ tenantId, title: "APR integridade", companyId: "company-test", unitId: "unit-test", activityStage: "Etapa sintética", workArea: "Área sintética", responsible: "Pessoa fictícia", pgrInventoryId: "pgr-test", pgrRevision: 1, pgrTitle: "PGR sintético", risks: [{ inventoryId: "pgr-test", inventoryRevision: 1, riskId: "risk-test", activity: "Atividade sintética", hazard: "Perigo sintético", possibleHarm: "", exposureDescription: "" }], checklistTemplateId: template.id, checklistTemplateVersion: 1, createdBy: "author-test" });
  const validAnswers = apr.answers.map(answer => ({ id: answer.id, result: "observed" as const, notes: "Observação fictícia", nextStep: "", responsible: "" }));
  const path = join(process.cwd(), "data", "safety-operations.json");
  const original = readFileSync(path, "utf8");
  const changes = [
    (record: typeof apr) => { record.answers = []; },
    (record: typeof apr) => { record.answers[0].result = "resultado-desconhecido" as typeof record.answers[0]["result"]; },
    (record: typeof apr) => { record.answers[1].id = record.answers[0].id; },
    (record: typeof apr) => { record.answers[0].prompt = "Pergunta substituída fora do fluxo"; },
    (record: typeof apr) => { record.checklistSnapshot!.tenantId = "outro-tenant"; },
    (record: typeof apr) => { record.checklistSnapshot!.version = 99; },
    (record: typeof apr) => { record.checklistSnapshot!.items[0].prompt = "Snapshot divergente"; },
    (record: typeof apr) => { record.answers[0].notes = null as unknown as string; },
  ];
  try {
    for (const change of changes) {
      const stored = JSON.parse(original) as { aprs: typeof apr[] };
      change(stored.aprs.find(record => record.id === apr.id)!);
      writeFileSync(path, JSON.stringify(stored), "utf8");
      const before = readFileSync(path, "utf8");
      assert.throws(() => saveSafetyAprAnswers(tenantId, apr.id, 1, validAnswers, "editor-test"), /checklist da APR está inconsistente/);
      assert.throws(() => submitSafetyAprForReview(tenantId, apr.id, 1, "reviewer-test"), /checklist da APR está inconsistente/);
      assert.equal(readFileSync(path, "utf8"), before);
    }
  } finally { writeFileSync(path, original, "utf8"); }
  const saved = saveSafetyAprAnswers(tenantId, apr.id, 1, validAnswers, "editor-test");
  const submitted = submitSafetyAprForReview(tenantId, apr.id, saved.revision, "reviewer-test");
  assert.equal(submitted.status, "in_review");
  assert.deepEqual(submitted.checklistSnapshot, apr.checklistSnapshot);
});

test("histórico APR preserva estado legado conhecido, exige ator e recusa divergência sem gravar", () => {
  const tenantId = "tenant-history";
  const draft = createSafetyChecklistTemplate({ tenantId, title: "Modelo histórico", activity: "Atividade sintética", prompts: ["Pergunta sintética"], previousTemplateId: "", createdBy: "author-test" });
  const model = activateSafetyChecklistTemplate(tenantId, draft.id, "reviewer-test");
  const apr = createSafetyApr({ tenantId, title: "APR histórica", companyId: "company-test", unitId: "unit-test", activityStage: "Etapa sintética", workArea: "Área sintética", responsible: "Pessoa fictícia", pgrInventoryId: "pgr-test", pgrRevision: 1, pgrTitle: "PGR sintético", risks: [{ inventoryId: "pgr-test", inventoryRevision: 1, riskId: "risk-test", activity: "Atividade sintética", hazard: "Perigo sintético", possibleHarm: "", exposureDescription: "" }], checklistTemplateId: model.id, checklistTemplateVersion: 1, createdBy: "author-test" });
  const answers = apr.answers.map(answer => ({ id: answer.id, result: "observed" as const, notes: "Observação sintética", nextStep: "", responsible: "" }));
  const path = join(process.cwd(), "data", "safety-operations.json");
  const before = readFileSync(path, "utf8");
  assert.throws(() => saveSafetyAprAnswers(tenantId, apr.id, 1, answers, " "), /conta que salva/);
  assert.equal(readFileSync(path, "utf8"), before);
  const legacy = JSON.parse(before) as { aprs: typeof apr[] };
  const record = legacy.aprs.find(entry => entry.id === apr.id)!;
  delete record.history;
  record.revision = 7;
  writeFileSync(path, JSON.stringify(legacy), "utf8");
  const saved = saveSafetyAprAnswers(tenantId, apr.id, 7, answers, "editor-test");
  assert.deepEqual(saved.history?.map(entry => entry.revision), [7, 8]);
  assert.equal(saved.history?.[0].action, "legacy_snapshot");
  assert.equal(saved.history?.[0].actorUserId, undefined);
  assert.equal(saved.history?.[1].actorUserId, "editor-test");
  assert.equal(saved.history?.[0].answers[0].result, "unanswered");
  saved.history![0].answers[0].prompt = "Mutação externa";
  assert.equal(listSafetyAprs(tenantId)[0].history?.[0].answers[0].prompt, "Pergunta sintética");
  const corrupted = JSON.parse(readFileSync(path, "utf8")) as { aprs: typeof apr[] };
  corrupted.aprs.find(entry => entry.id === apr.id)!.history!.at(-1)!.answers[0].notes = "Divergência sintética";
  writeFileSync(path, JSON.stringify(corrupted), "utf8");
  const corruptBefore = readFileSync(path, "utf8");
  assert.throws(() => saveSafetyAprAnswers(tenantId, apr.id, 8, answers, "editor-test"), /histórico da APR diverge/);
  assert.throws(() => submitSafetyAprForReview(tenantId, apr.id, 8, "reviewer-test"), /histórico da APR diverge/);
  assert.equal(readFileSync(path, "utf8"), corruptBefore);
});
