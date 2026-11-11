import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DocumentSignatureError, normalizeSignerName, sameSignerName, validateSignatureImage, type DocumentSigner, type DocumentSignature, type DocumentSignerRole } from "./document-signatures";

export type SafetyChecklistItem = { id: string; prompt: string };
export type SafetyChecklistActivityKind = "general_activity" | "confined_space_nr33";
export type SafetyChecklistTemplate = {
  id: string;
  tenantId: string;
  activityKind: SafetyChecklistActivityKind;
  title: string;
  activity: string;
  version: number;
  status: "draft" | "active" | "superseded";
  previousTemplateId: string;
  items: SafetyChecklistItem[];
  reference?: { title: string; version: string; jurisdiction: string; validFrom: string; validUntil: string; reviewer: string };
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  createdBy: string;
};
export type AprRiskSnapshot = {
  inventoryId: string;
  inventoryRevision: number;
  riskId: string;
  activity: string;
  hazard: string;
  possibleHarm: string;
  exposureDescription: string;
  fieldDescription?: string;
};
// Risco identificado durante a avaliação da tarefa que não estava no PGR selecionado.
// Fica separado dos riscos de origem PGR para preservar a rastreabilidade da base.
export type AprAdditionalRisk = {
  id: string;
  hazard: string;
  possibleHarm: string;
  identificationBasis: string;
  controls: string[];
};
// Medida adicional aplicada a um risco já previsto no PGR, sem alterar o snapshot do PGR.
export type AprAdditionalPgrControl = {
  id: string;
  riskId: string;
  description: string;
};
export type AprChecklistAnswer = {
  id: string;
  prompt: string;
  result: "unanswered" | "observed" | "attention" | "not_applicable";
  notes: string;
  nextStep: string;
  responsible: string;
};
export type SafetyAprRevision = {
  revision: number;
  status: "draft" | "in_review";
  action: "created" | "saved" | "submitted" | "legacy_snapshot";
  occurredAt: string;
  actorUserId?: string;
  answers: AprChecklistAnswer[];
};
export type SafetyApr = {
  id: string;
  /** Número do documento, sequencial por tenant: APR-2026-0001. */
  documentNumber?: string;
  tenantId: string;
  revision: number;
  status: "draft" | "in_review";
  title: string;
  companyId: string;
  unitId: string;
  activityStage: string;
  workArea: string;
  responsible: string;
  pgrInventoryId: string;
  pgrRevision: number;
  pgrTitle: string;
  risks: AprRiskSnapshot[];
  // Opcionais para preservar APRs gravadas antes da regra de riscos/controles adicionais.
  additionalRisks?: AprAdditionalRisk[];
  additionalPgrControls?: AprAdditionalPgrControl[];
  checklistTemplateId: string;
  checklistTemplateVersion: number;
  checklistTitle: string;
  // Ausente nas APRs legadas; não reconstruir revisão/referência retroativamente.
  checklistSnapshot?: SafetyChecklistTemplate;
  answers: AprChecklistAnswer[];
  /** Quem assina a ciência: emissor (líder/encarregado) e participantes da atividade. */
  signers?: DocumentSigner[];
  signatures?: DocumentSignature[];
  history?: SafetyAprRevision[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  submittedAt?: string;
  submittedBy?: string;
};
type SafetyOperationsData = { templates: SafetyChecklistTemplate[]; aprs: SafetyApr[] };
type NewTemplate = {
  tenantId: string; activityKind?: SafetyChecklistActivityKind; title: string; activity: string; prompts: string[]; previousTemplateId: string;
  reference?: SafetyChecklistTemplate["reference"]; createdBy: string;
};
type NewApr = Omit<SafetyApr, "id" | "revision" | "status" | "answers" | "history" | "checklistTitle" | "checklistSnapshot" | "createdAt" | "updatedAt" | "submittedAt" | "submittedBy" | "additionalRisks" | "additionalPgrControls"> & {
  createdBy: string;
  additionalRisks?: Array<Omit<AprAdditionalRisk, "id">>;
  additionalPgrControls?: Array<Omit<AprAdditionalPgrControl, "id">>;
};
type AnswerInput = Pick<AprChecklistAnswer, "id" | "result" | "notes" | "nextStep" | "responsible">;

const emptyData: SafetyOperationsData = { templates: [], aprs: [] };

export class SafetyOperationsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyOperationsValidationError";
  }
}

function storePath() { return join(process.cwd(), "data", "safety-operations.json"); }
function readData(): SafetyOperationsData {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as SafetyOperationsData).templates) || !Array.isArray((value as SafetyOperationsData).aprs)) {
      throw new SafetyOperationsValidationError("O arquivo local de APR e checklists tem formato inválido.");
    }
    const data = value as SafetyOperationsData;
    return {
      ...data,
      templates: data.templates.map((template) => ({
        ...template,
        activityKind: template.activityKind ?? "general_activity",
      })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyData };
    throw error;
  }
}
function writeData(data: SafetyOperationsData) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}
function copyTemplate(template: SafetyChecklistTemplate): SafetyChecklistTemplate {
  return { ...template, items: template.items.map((item) => ({ ...item })), ...(template.reference ? { reference: { ...template.reference } } : {}) };
}
function copyApr(apr: SafetyApr): SafetyApr {
  return { ...apr, risks: apr.risks.map((risk) => ({ ...risk })), answers: apr.answers.map((answer) => ({ ...answer })),
    ...(apr.additionalRisks ? { additionalRisks: apr.additionalRisks.map(risk => ({ ...risk, controls: [...risk.controls] })) } : {}),
    ...(apr.additionalPgrControls ? { additionalPgrControls: apr.additionalPgrControls.map(control => ({ ...control })) } : {}),
    ...(apr.signers ? { signers: apr.signers.map(signer => ({ ...signer })) } : {}),
    ...(apr.signatures ? { signatures: apr.signatures.map(signature => ({ ...signature })) } : {}),
    ...(apr.checklistSnapshot ? { checklistSnapshot: copyTemplate(apr.checklistSnapshot) } : {}),
    ...(apr.history ? { history: apr.history.map(entry => ({ ...entry, answers: entry.answers.map(answer => ({ ...answer })) })) } : {}) };
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
}
function hasValidReference(reference: SafetyChecklistTemplate["reference"]): boolean {
  if (!reference) return false;
  return Boolean(reference.title.trim() && reference.title.length <= 180
    && reference.version.trim() && reference.version.length <= 80
    && reference.jurisdiction.trim() && reference.jurisdiction.length <= 100
    && reference.reviewer.trim() && reference.reviewer.length <= 120
    && validDate(reference.validFrom) && (!reference.validUntil || validDate(reference.validUntil))
    && (!reference.validUntil || reference.validUntil >= reference.validFrom));
}

export function listSafetyChecklistTemplates(tenantId: string): SafetyChecklistTemplate[] {
  return readData().templates.filter((template) => template.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copyTemplate);
}

export function listSafetyAprs(tenantId: string): SafetyApr[] {
  return readData().aprs.filter((apr) => apr.tenantId === tenantId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(copyApr);
}

export function createSafetyChecklistTemplate(input: NewTemplate): SafetyChecklistTemplate {
  const title = input.title.trim();
  const activity = input.activity.trim();
  const activityKind = input.activityKind ?? "general_activity";
  const prompts = input.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  const reference = input.reference ? {
    title: input.reference.title.trim(),
    version: input.reference.version.trim(),
    jurisdiction: input.reference.jurisdiction.trim(),
    validFrom: input.reference.validFrom.trim(),
    validUntil: input.reference.validUntil.trim(),
    reviewer: input.reference.reviewer.trim(),
  } : undefined;
  if (!["general_activity", "confined_space_nr33"].includes(activityKind)
    || !title || title.length > 140 || !activity || activity.length > 300 || !input.tenantId || !input.createdBy
    || prompts.length < 1 || prompts.length > 50 || prompts.some((prompt) => prompt.length > 300)) {
    throw new SafetyOperationsValidationError("Informe o nome, a atividade e de 1 a 50 itens válidos para o checklist.");
  }
  if (reference) {
    if (!hasValidReference(reference)) {
      throw new SafetyOperationsValidationError("Confira a fonte e a vigência informadas para o checklist.");
    }
  }

  const data = readData();
  const previous = input.previousTemplateId
    ? data.templates.find((template) => template.id === input.previousTemplateId && template.tenantId === input.tenantId && template.status === "active")
    : undefined;
  if (input.previousTemplateId && !previous) throw new SafetyOperationsValidationError("A versão anterior do checklist não está disponível nesta consultoria.");
  if (previous && (previous.title !== title || previous.activity !== activity || previous.activityKind !== activityKind)) {
    throw new SafetyOperationsValidationError("Uma nova versão precisa manter a categoria, o nome e a atividade do modelo anterior.");
  }
  if (previous && data.templates.some((template) => template.status === "draft" && template.previousTemplateId === previous.id)) {
    throw new SafetyOperationsValidationError("Já existe uma versão em rascunho deste modelo. Revise ou conclua essa versão antes de criar outra.");
  }
  if (!previous && data.templates.some((template) => template.tenantId === input.tenantId
    && template.activityKind === activityKind && template.title === title && template.activity === activity
    && template.status !== "superseded")) {
    throw new SafetyOperationsValidationError("Já existe um modelo com esta categoria, nome e atividade. Crie uma nova versão do modelo ativo.");
  }
  const template: SafetyChecklistTemplate = {
    id: randomUUID(),
    tenantId: input.tenantId,
    activityKind,
    title,
    activity,
    version: previous ? previous.version + 1 : 1,
    status: "draft",
    previousTemplateId: previous?.id ?? "",
    items: prompts.map((prompt) => ({ id: randomUUID(), prompt })),
    ...(reference ? { reference } : {}),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  writeData({ ...data, templates: [...data.templates, template] });
  return copyTemplate(template);
}

export function activateSafetyChecklistTemplate(tenantId: string, templateId: string, reviewerId: string): SafetyChecklistTemplate {
  if (!tenantId || !templateId || !reviewerId) throw new SafetyOperationsValidationError("Não foi possível registrar a revisão humana do modelo.");
  const data = readData();
  const template = data.templates.find((entry) => entry.id === templateId && entry.tenantId === tenantId);
  if (!template || template.status !== "draft") throw new SafetyOperationsValidationError("O rascunho do checklist não está disponível para revisão.");
  if (typeof template.title !== "string" || !template.title.trim() || template.title.length > 140
    || typeof template.activity !== "string" || !template.activity.trim() || template.activity.length > 300
    || !["general_activity", "confined_space_nr33"].includes(template.activityKind)
    || !Number.isSafeInteger(template.version) || template.version < 1) {
    throw new SafetyOperationsValidationError("Confira nome, atividade, categoria e versão do modelo antes de ativar.");
  }
  if (!Array.isArray(template.items) || !template.items.length || template.items.length > 50
    || template.items.some(item => !item || typeof item.id !== "string" || !item.id.trim()
      || typeof item.prompt !== "string" || !item.prompt.trim() || item.prompt.length > 300)
    || new Set(template.items.map(item => item.id)).size !== template.items.length) {
    throw new SafetyOperationsValidationError("O modelo precisa conter de 1 a 50 perguntas válidas, até 300 caracteres cada, com identificadores únicos.");
  }
  if (template.reference && !hasValidReference(template.reference)) {
    throw new SafetyOperationsValidationError("Confira a fonte, versão, âmbito, vigência e responsável pela revisão antes de ativar.");
  }
  if (template.activityKind === "confined_space_nr33"
    && (!template.reference || !/NR[\s.-]*33/i.test(template.reference.title))) {
    throw new SafetyOperationsValidationError("Para ativar o modelo de espaço confinado, registre a referência NR-33, versão, jurisdição, vigência e responsável pela revisão.");
  }
  const previous = template.previousTemplateId
    ? data.templates.find((entry) => entry.id === template.previousTemplateId && entry.tenantId === tenantId && entry.status === "active")
    : undefined;
  if (template.previousTemplateId && !previous) throw new SafetyOperationsValidationError("A versão anterior do modelo mudou. Atualize a página antes de ativar.");
  if (previous && (template.title !== previous.title || template.activity !== previous.activity
    || template.activityKind !== previous.activityKind || template.version !== previous.version + 1)) {
    throw new SafetyOperationsValidationError("A nova versão precisa manter a identidade do modelo e a sequência de versões.");
  }
  if (!previous && template.version !== 1) throw new SafetyOperationsValidationError("Um modelo novo precisa começar na versão 1.");
  if (previous) previous.status = "superseded";
  template.status = "active";
  template.reviewedAt = new Date().toISOString();
  template.reviewedBy = reviewerId;
  writeData(data);
  return copyTemplate(template);
}

function normalizeAdditionalRisks(input: NewApr["additionalRisks"]): AprAdditionalRisk[] {
  const risks = Array.isArray(input) ? input : [];
  if (risks.length > 50) {
    throw new SafetyOperationsValidationError("Registre no máximo 50 riscos adicionais identificados na avaliação da tarefa.");
  }
  const seen = new Set<string>();
  return risks.map((risk) => {
    const hazard = typeof risk?.hazard === "string" ? risk.hazard.trim() : "";
    const possibleHarm = typeof risk?.possibleHarm === "string" ? risk.possibleHarm.trim() : "";
    const identificationBasis = typeof risk?.identificationBasis === "string" ? risk.identificationBasis.trim() : "";
    const controls = Array.isArray(risk?.controls)
      ? risk.controls.map((control) => typeof control === "string" ? control.trim() : "").filter(Boolean)
      : [];
    if (!hazard || hazard.length > 300 || possibleHarm.length > 500
      || !identificationBasis || identificationBasis.length > 1000
      || !controls.length || controls.length > 20 || controls.some((control) => control.length > 600)) {
      throw new SafetyOperationsValidationError("Cada risco adicional precisa de perigo, origem na avaliação da tarefa e de 1 a 20 medidas de controle, com os limites indicados.");
    }
    const key = hazard.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) throw new SafetyOperationsValidationError("Um risco adicional foi repetido. Una os registros do mesmo perigo.");
    seen.add(key);
    return { id: randomUUID(), hazard, possibleHarm, identificationBasis, controls };
  });
}

function normalizeAdditionalPgrControls(input: NewApr["additionalPgrControls"], selectedRiskIds: Set<string>): AprAdditionalPgrControl[] {
  const controls = Array.isArray(input) ? input : [];
  if (controls.length > 100) {
    throw new SafetyOperationsValidationError("Registre no máximo 100 medidas de controle adicionais para riscos do PGR.");
  }
  const seen = new Set<string>();
  return controls.map((control) => {
    const riskId = typeof control?.riskId === "string" ? control.riskId.trim() : "";
    const description = typeof control?.description === "string" ? control.description.trim() : "";
    if (!selectedRiskIds.has(riskId) || !description || description.length > 600) {
      throw new SafetyOperationsValidationError("Cada medida adicional precisa apontar para um risco selecionado do PGR e ter até 600 caracteres.");
    }
    const key = `${riskId}\u0000${description}`;
    if (seen.has(key)) throw new SafetyOperationsValidationError("Uma medida adicional foi repetida para o mesmo risco do PGR.");
    seen.add(key);
    return { id: randomUUID(), riskId, description };
  });
}

export function createSafetyApr(input: NewApr): SafetyApr {
  if (!input.tenantId || !input.createdBy || !input.companyId || !input.unitId || !input.pgrInventoryId
    || !input.pgrTitle || !Number.isSafeInteger(input.pgrRevision) || input.pgrRevision < 1
    || !input.checklistTemplateId || !Number.isSafeInteger(input.checklistTemplateVersion) || input.checklistTemplateVersion < 1
    || !input.title.trim() || input.title.length > 140 || !input.activityStage.trim() || input.activityStage.length > 1000
    || !input.workArea.trim() || input.workArea.length > 500 || !input.responsible.trim() || input.responsible.length > 120
    || !input.risks.length || input.risks.length > 100 || new Set(input.risks.map((risk) => risk.riskId)).size !== input.risks.length
    || input.risks.some((risk) => !risk.riskId || !risk.hazard.trim()
      || risk.inventoryId !== input.pgrInventoryId || risk.inventoryRevision !== input.pgrRevision)) {
    throw new SafetyOperationsValidationError("Confira o escopo, a etapa, a pessoa responsável e os riscos selecionados para a APR.");
  }
  const additionalRisks = normalizeAdditionalRisks(input.additionalRisks);
  const additionalPgrControls = normalizeAdditionalPgrControls(input.additionalPgrControls, new Set(input.risks.map((risk) => risk.riskId)));
  const data = readData();
  const template = data.templates.find((entry) => entry.id === input.checklistTemplateId
    && entry.tenantId === input.tenantId && entry.version === input.checklistTemplateVersion && entry.status === "active");
  if (!template) throw new SafetyOperationsValidationError("O modelo de checklist ativo não está disponível. Atualize a página.");
  const now = new Date().toISOString();
  const year = now.slice(0, 4);
  const sequence = data.aprs.filter((entry) => entry.tenantId === input.tenantId && entry.documentNumber?.startsWith(`APR-${year}-`)).length + 1;
  const apr: SafetyApr = {
    ...input,
    id: randomUUID(),
    documentNumber: `APR-${year}-${String(sequence).padStart(4, "0")}`,
    revision: 1,
    status: "draft",
    risks: input.risks.map((risk) => ({ ...risk })),
    additionalRisks,
    additionalPgrControls,
    checklistTitle: template.title,
    checklistSnapshot: copyTemplate(template),
    answers: template.items.map((item) => ({
      id: item.id, prompt: item.prompt, result: "unanswered", notes: "", nextStep: "", responsible: "",
    })),
    createdAt: now,
    updatedAt: now,
  };
  apr.history = [captureAprRevision(apr, "created", input.createdBy)];
  writeData({ ...data, aprs: [...data.aprs, apr] });
  return copyApr(apr);
}

function assertAprChecklistIntegrity(apr: SafetyApr) {
  const invalid = () => { throw new SafetyOperationsValidationError("O checklist da APR está inconsistente. Confira a revisão de origem antes de continuar."); };
  if (!Array.isArray(apr.answers) || apr.answers.length < 1 || apr.answers.length > 50
    || apr.answers.some(answer => !answer || typeof answer.id !== "string" || !answer.id.trim()
      || typeof answer.prompt !== "string" || !answer.prompt.trim() || answer.prompt.length > 300
      || !["unanswered", "observed", "attention", "not_applicable"].includes(answer.result)
      || typeof answer.notes !== "string" || answer.notes.length > 1200
      || typeof answer.nextStep !== "string" || answer.nextStep.length > 600
      || typeof answer.responsible !== "string" || answer.responsible.length > 120)
    || new Set(apr.answers.map(answer => answer.id)).size !== apr.answers.length) invalid();
  const snapshot = apr.checklistSnapshot;
  if (snapshot !== undefined && (!snapshot || snapshot.id !== apr.checklistTemplateId || snapshot.tenantId !== apr.tenantId
    || snapshot.version !== apr.checklistTemplateVersion || snapshot.title !== apr.checklistTitle
    || !Array.isArray(snapshot.items) || snapshot.items.length !== apr.answers.length
    || snapshot.items.some((item, index) => !item || item.id !== apr.answers[index].id || item.prompt !== apr.answers[index].prompt))) invalid();
}

function captureAprRevision(apr: SafetyApr, action: SafetyAprRevision["action"], actorUserId?: string): SafetyAprRevision {
  return { revision: apr.revision, status: apr.status, action, occurredAt: apr.updatedAt,
    ...(actorUserId ? { actorUserId } : {}), answers: apr.answers.map(answer => ({ ...answer })) };
}
function prepareAprHistory(apr: SafetyApr) {
  if (apr.history === undefined) { apr.history = [captureAprRevision(apr, "legacy_snapshot")]; return; }
  const last = Array.isArray(apr.history) ? apr.history.at(-1) : undefined;
  const keys = ["id", "prompt", "result", "notes", "nextStep", "responsible"] as const;
  if (!last || last.revision !== apr.revision || last.status !== apr.status || !Array.isArray(last.answers)
    || last.answers.length !== apr.answers.length
    || last.answers.some((answer, index) => !answer || keys.some(key => answer[key] !== apr.answers[index][key]))) {
    throw new SafetyOperationsValidationError("O histórico da APR diverge do estado atual. Confira a origem antes de continuar.");
  }
}
/** Inclui quem vai assinar a APR: emissor (líder/encarregado) ou participante. */
export function addSafetyAprSigner(tenantId: string, aprId: string, nameInput: string, roleInput: string, actorUserId: string, workerId?: string): SafetyApr {
  const data = readData();
  const apr = data.aprs.find((entry) => entry.id === aprId && entry.tenantId === tenantId);
  if (!apr) throw new SafetyOperationsValidationError("A APR não está disponível nesta consultoria.");
  if (!actorUserId?.trim()) throw new SafetyOperationsValidationError("A conta que inclui o assinante não foi identificada.");
  if (roleInput !== "issuer" && roleInput !== "participant") throw new SafetyOperationsValidationError("Informe se a pessoa é emissor ou participante.");
  let name: string;
  try { name = normalizeSignerName(nameInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new SafetyOperationsValidationError(error.message);
    throw error;
  }
  const signers = apr.signers ?? [];
  if (signers.some((signer) => sameSignerName(signer.name, name) || (workerId ? signer.workerId === workerId : false))) {
    throw new SafetyOperationsValidationError("Esta pessoa já está na lista de assinaturas.");
  }
  apr.signers = [...signers, { id: randomUUID(), name, role: roleInput as DocumentSignerRole, ...(workerId ? { workerId } : {}) }];
  apr.updatedAt = new Date().toISOString();
  writeData(data);
  return copyApr(apr);
}

/** Registra a assinatura desenhada na tela de uma pessoa já incluída na APR. */
export function signSafetyApr(tenantId: string, aprId: string, signerId: string, imageInput: string, actorUserId: string): SafetyApr {
  const data = readData();
  const apr = data.aprs.find((entry) => entry.id === aprId && entry.tenantId === tenantId);
  if (!apr) throw new SafetyOperationsValidationError("A APR não está disponível nesta consultoria.");
  if (!actorUserId?.trim()) throw new SafetyOperationsValidationError("A conta que coleta a assinatura não foi identificada.");
  const signer = (apr.signers ?? []).find((entry) => entry.id === signerId);
  if (!signer) throw new SafetyOperationsValidationError("O assinante não está na lista desta APR. Atualize a página.");
  if ((apr.signatures ?? []).some((signature) => signature.signerId === signerId)) {
    throw new SafetyOperationsValidationError("Esta pessoa já assinou esta APR.");
  }
  let image: string;
  try { image = validateSignatureImage(imageInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new SafetyOperationsValidationError(error.message);
    throw error;
  }
  const signature: DocumentSignature = {
    signerId: signer.id,
    signerName: signer.name,
    role: signer.role,
    image,
    signedAt: new Date().toISOString(),
    capturedByUserId: actorUserId,
    method: "drawn_on_screen_simple",
  };
  apr.signatures = [...(apr.signatures ?? []), signature];
  apr.updatedAt = signature.signedAt;
  writeData(data);
  return copyApr(apr);
}

export function saveSafetyAprAnswers(tenantId: string, aprId: string, expectedRevision: number, answers: AnswerInput[], actorUserId: string): SafetyApr {
  const data = readData();
  const apr = data.aprs.find((entry) => entry.id === aprId && entry.tenantId === tenantId);
  if (!apr || apr.status !== "draft") throw new SafetyOperationsValidationError("A APR não está disponível para edição.");
  if (apr.revision !== expectedRevision) throw new SafetyOperationsValidationError("A APR foi alterada em outra sessão. Atualize a página antes de salvar.");
  assertAprChecklistIntegrity(apr);
  if (!actorUserId?.trim()) throw new SafetyOperationsValidationError("A conta que salva a APR não foi identificada.");
  if (answers.length !== apr.answers.length || new Set(answers.map((answer) => answer.id)).size !== answers.length) {
    throw new SafetyOperationsValidationError("As respostas do checklist estão incompletas ou duplicadas.");
  }
  const updated = apr.answers.map((item) => {
    const answer = answers.find((entry) => entry.id === item.id);
    if (!answer || !["unanswered", "observed", "attention", "not_applicable"].includes(answer.result)
      || typeof answer.notes !== "string" || answer.notes.length > 1200
      || typeof answer.nextStep !== "string" || answer.nextStep.length > 600
      || typeof answer.responsible !== "string" || answer.responsible.length > 120) {
      throw new SafetyOperationsValidationError("Confira as respostas do checklist e tente novamente.");
    }
    return { ...item, result: answer.result, notes: answer.notes.trim(), nextStep: answer.nextStep.trim(), responsible: answer.responsible.trim() };
  });
  prepareAprHistory(apr);
  apr.answers = updated;
  apr.revision += 1;
  apr.updatedAt = new Date().toISOString();
  apr.history!.push(captureAprRevision(apr, "saved", actorUserId));
  writeData(data);
  return copyApr(apr);
}

export function submitSafetyAprForReview(tenantId: string, aprId: string, expectedRevision: number, actorUserId: string): SafetyApr {
  const data = readData();
  const apr = data.aprs.find((entry) => entry.id === aprId && entry.tenantId === tenantId);
  if (!apr || apr.status !== "draft") throw new SafetyOperationsValidationError("A APR não está disponível para envio à revisão.");
  if (apr.revision !== expectedRevision) throw new SafetyOperationsValidationError("A APR foi alterada em outra sessão. Atualize a página antes de enviar.");
  assertAprChecklistIntegrity(apr);
  if (!actorUserId?.trim()) throw new SafetyOperationsValidationError("A pessoa que envia a APR não foi identificada.");
  if (apr.answers.some((answer) => answer.result === "unanswered")) throw new SafetyOperationsValidationError("Responda todos os itens do checklist antes do envio.");
  if (apr.answers.some((answer) => answer.result === "not_applicable" && !answer.notes.trim())) {
    throw new SafetyOperationsValidationError("Itens não aplicáveis exigem justificativa.");
  }
  if (apr.answers.some((answer) => answer.result === "attention" && (!answer.notes.trim() || !answer.nextStep.trim() || !answer.responsible.trim()))) {
    throw new SafetyOperationsValidationError("Pontos a tratar exigem descrição, próximo passo e responsável.");
  }
  prepareAprHistory(apr);
  apr.status = "in_review";
  apr.revision += 1;
  apr.updatedAt = new Date().toISOString();
  apr.submittedAt = apr.updatedAt;
  apr.submittedBy = actorUserId;
  apr.history!.push(captureAprRevision(apr, "submitted", actorUserId));
  writeData(data);
  return copyApr(apr);
}
