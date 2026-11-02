import { readLocalDataText, type LocalDataFile } from "./local-data-read.ts";
// Demonstração local testável; a aplicação importa exclusivamente pelo serviço server-only.
import { isTenantEnabled, assertModuleEnabled } from "./tenant-state.ts";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requireTenantAccess } from "./tenant-access.ts";
import { appendAuditEvent } from "./audit-log.ts";
import type { WorkerRecord } from "./worker-store";
import type { ClientCompany } from "./client-store";
import { EPI_DEMO_STATEMENT } from "./epi-demo.ts";

export type EpiItem = { name: string; reference: string; size: string; quantity: number; ca?: string; caValidUntil?: string; caCheckedOn?: string; manufacturer?: string; lot?: string; productValidity?: string; protectionPurpose?: string; deliveryType?: "initial" | "replacement"; replacementReason?: string; instructions?: string; trainingStatus?: "not_applicable" | "provided" | "pending"; trainingDate?: string };
type EpiEvent = { id: string; action: "created" | "offline_reviewed" | "link_renewed" | "code_issued" | "code_failed" | "confirmed" | "canceled"; actorUserId: string; occurredAt: string; reason?: string };
export type EpiConfirmation = { protocol: string; confirmedAt: string; deliveryDigest: string; mode: "mock"; statement: string; statementVersion: "demo-v1" };
export type OfflineEpiSubmission = {
  id: string; clientRequestId: string; tenantId: string; workerId: string; companyId: string; unitId: string;
  workerName: string; companyName: string; unitName: string; deliveredOn: string; items: EpiItem[];
  status: "pending_ca_review" | "delivery_created"; createdAt: string; receivedAt: string; createdBy: string;
  deliveryId?: string; reviewedAt?: string; reviewedBy?: string;
};
export type EpiOfflineSubmissionSummary = Pick<OfflineEpiSubmission, "id" | "workerId" | "companyId" | "workerName" | "companyName" | "unitName" | "deliveredOn" | "items" | "status" | "receivedAt" | "deliveryId">;
export type EpiStockReconciliation = { status: "pending" | "complete" | "over_issued"; items: Array<{ ca: string; size: string; expected: number; issued: number; remaining: number }> };
type Delivery = {
  id: string; tenantId: string; workerId: string; companyId: string; unitId: string;
  workerName: string; companyName: string; unitName: string; relatedCnpj: string;
  workerArea?: string;
  items: EpiItem[]; deliveredOn: string; notes: string; createdAt: string; createdBy: string;
  status: "pending" | "confirmed" | "canceled" | "offline_recorded"; origin?: "online" | "offline"; offlineSubmissionId?: string; stockReconciliation?: EpiStockReconciliation; tokenHash: string; expiresAt: string;
  challenge?: { hash: string; expiresAt: string }; failedAttempts: number;
  confirmation?: EpiConfirmation; events: EpiEvent[];
};
export type EpiDelivery = Omit<Delivery, "tokenHash" | "challenge" | "failedAttempts"> & { linkStatus: "active" | "expired" | "closed" };
export type EpiWorker = { id: string; companyId: string; displayName: string; companyName: string; unitName: string };
export type EpiPortal = Pick<EpiDelivery, "workerName" | "companyName" | "unitName" | "items" | "deliveredOn" | "expiresAt" | "status" | "confirmation">;
type Database = { deliveries: Delivery[]; offlineSubmissions?: OfflineEpiSubmission[] };
const attempts = new Map<string, { started: number; count: number }>();
const path = () => join(process.cwd(), "data", "epi.json");
function read(): Database {
  try { return JSON.parse(readFileSync(path(), "utf8")) as Database; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { deliveries: [] }; throw error; }
}
function write(db: Database) {
  mkdirSync(dirname(path()), { recursive: true }); const temp = `${path()}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx", encoding: "utf8" }); renameSync(temp, path());
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function rate(key: string) {
  const now = Date.now(); for (const [k, entry] of attempts) if (now - entry.started >= 60000) attempts.delete(k);
  if (!attempts.has(key) && attempts.size >= 5000) throw new Error("Muitas solicitações. Aguarde um minuto.");
  const entry = attempts.get(key) ?? { started: now, count: 0 }; attempts.set(key, entry);
  if (++entry.count > 30) throw new Error("Muitas solicitações. Aguarde um minuto.");
}
function context(userId: string, manage = false) {
  const access = requireTenantAccess(userId, manage ? "epi.manage" : "epi.read");
  if (!access.ok) throw new Error("Acesso a EPI não autorizado."); return access.context;
}
function sources() {
  const load = <T,>(name: LocalDataFile): T[] => {
    try { return JSON.parse(readLocalDataText(name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  };
  return { workers: load<WorkerRecord>("workers.json"), companies: load<ClientCompany>("clients.json") };
}
function scope(tenantId: string, workerId: string) {
  if (!isTenantEnabled(tenantId)) return null;
  const { workers, companies } = sources();
  const worker = workers.find(w => w.id === workerId && w.tenantId === tenantId && w.status === "active");
  const company = companies.find(c => c.id === worker?.companyId && c.tenantId === tenantId && c.status === "active");
  const unit = company?.units.find(u => u.id === worker?.unitId);
  return worker && company && unit ? { worker, company, unit } : null;
}
function activeScope(delivery: Delivery) {
  const current = scope(delivery.tenantId, delivery.workerId);
  return current && current.company.id === delivery.companyId && current.unit.id === delivery.unitId;
}
function summary(delivery: Delivery): EpiDelivery {
  const { tokenHash: _token, challenge: _challenge, failedAttempts: _attempts, ...safe } = delivery;
  // Auth fields never leave this infrastructure, even for an administrator.
  void _token; void _challenge; void _attempts;
  return { ...structuredClone(safe), linkStatus: delivery.status !== "pending" ? "closed" : Date.parse(delivery.expiresAt) <= Date.now() ? "expired" : "active" };
}
function portal(delivery: Delivery): EpiPortal {
  return { workerName: delivery.workerName, companyName: delivery.companyName, unitName: delivery.unitName, items: structuredClone(delivery.items), deliveredOn: delivery.deliveredOn, expiresAt: delivery.expiresAt, status: delivery.status, confirmation: delivery.confirmation ? structuredClone(delivery.confirmation) : undefined };
}
function resolve(db: Database, token: string, allowConfirmed = false) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Link indisponível. Solicite novo link à consultoria.");
  const digest = hash(token); rate(`portal:${digest}`);
  const delivery = db.deliveries.find(d => d.tokenHash === digest && d.status !== "canceled" && (allowConfirmed || d.status === "pending") && Date.parse(d.expiresAt) > Date.now());
  if (!delivery || !activeScope(delivery)) throw new Error("Link indisponível ou expirado. Solicite novo link à consultoria.");
  return delivery;
}
function audit(delivery: Delivery, actorUserId: string, action: "epi.created" | "epi.read" | "epi.link_renewed" | "epi.code_issued" | "epi.code_failed" | "epi.confirmed" | "epi.canceled" | "epi.receipt_read" | "epi.offline_reviewed") {
  const isPortal = actorUserId.startsWith("invite:");
  appendAuditEvent({ tenantId: delivery.tenantId, actorUserId, actorRole: isPortal ? "cliente" : context(actorUserId).membership.role, action, targetId: delivery.id });
}
function event(delivery: Delivery, action: EpiEvent["action"], actorUserId: string, reason?: string) {
  delivery.events.push({ id: randomUUID(), action, actorUserId, occurredAt: new Date().toISOString(), ...(reason ? { reason } : {}) });
}
function text(value: string, label: string, limit: number, optional = false) {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > limit) throw new Error(`Confira ${label} (até ${limit} caracteres).`);
  return value.trim();
}
function deliveryDigest(delivery: Delivery) {
  return hash(JSON.stringify({ id: delivery.id, tenantId: delivery.tenantId, workerId: delivery.workerId, companyId: delivery.companyId, unitId: delivery.unitId, workerName: delivery.workerName, workerArea: delivery.workerArea, companyName: delivery.companyName, unitName: delivery.unitName, relatedCnpj: delivery.relatedCnpj, items: delivery.items, deliveredOn: delivery.deliveredOn, notes: delivery.notes, createdAt: delivery.createdAt, createdBy: delivery.createdBy }));
}
export function listEpiWorkers(userId: string): EpiWorker[] {
  const access = context(userId, true);
  return sources().workers.filter(w => w.tenantId === access.tenant.id && w.status === "active").flatMap(w => {
    const current = scope(access.tenant.id, w.id); return current ? [{ id: w.id, companyId:current.company.id, displayName: w.displayName, companyName: current.company.tradeName || current.company.legalName, unitName: current.unit.name }] : [];
  });
}
export function createEpiDelivery(userId: string, input: { workerId: string; deliveredOn: string; items: EpiItem[]; notes: string }) {
  const access = context(userId, true); rate(`admin:${userId}`);
  const current = scope(access.tenant.id, input.workerId);
  if (!current) throw new Error("Selecione um trabalhador e unidade ativos desta consultoria.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveredOn) || Number.isNaN(Date.parse(`${input.deliveredOn}T12:00:00Z`)) || new Date(`${input.deliveredOn}T12:00:00Z`).toISOString().slice(0, 10) !== input.deliveredOn) throw new Error("Informe uma data de entrega válida.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) throw new Error("Informe entre 1 e 20 itens fictícios.");
  const items = input.items.map(item => {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw new Error("Informe quantidade inteira entre 1 e 1000.");
    const dateOrEmpty = (value: string | undefined, label: string) => {
      if (!value) return "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Informe ${label} válido.`);
      return value;
    };
    const ca = text(item.ca ?? "", "o CA", 40);
    const caValidUntil = dateOrEmpty(item.caValidUntil, "validade consultada do CA");
    const caCheckedOn = dateOrEmpty(item.caCheckedOn, "data da consulta do CA");
    if (!/^\d{1,8}$/.test(ca) || !caValidUntil || !caCheckedOn || caValidUntil < input.deliveredOn || caCheckedOn > input.deliveredOn || caCheckedOn < new Date(Date.parse(`${input.deliveredOn}T12:00:00Z`) - 15*86400000).toISOString().slice(0,10)) throw new Error("Entrega bloqueada: informe CA vigente na data, consultado manualmente nos 15 dias anteriores à entrega.");
    const deliveryType: EpiItem["deliveryType"] = item.deliveryType === "replacement" ? "replacement" : "initial";
    const trainingStatus: EpiItem["trainingStatus"] = item.trainingStatus === "provided" || item.trainingStatus === "pending" ? item.trainingStatus : "not_applicable";
    return { name: text(item.name, "o nome do item", 120), reference: text(item.reference, "a referência interna", 80, true), size: text(item.size, "o tamanho ou modelo", 60), quantity: item.quantity,
      ca, caValidUntil, caCheckedOn, manufacturer: text(item.manufacturer ?? "", "o fabricante/importador", 120, true), lot: text(item.lot ?? "", "o lote", 80, true), productValidity: dateOrEmpty(item.productValidity, "prazo de validade do produto"), protectionPurpose: text(item.protectionPurpose ?? "", "a finalidade de proteção", 240, true), deliveryType, replacementReason: text(item.replacementReason ?? "", "o motivo da reposição", 240, true), instructions: text(item.instructions ?? "", "as orientações registradas", 500, true), trainingStatus, trainingDate: dateOrEmpty(item.trainingDate, "a data do treinamento") };
  });
  const token = randomBytes(32).toString("hex"), now = new Date();
  const delivery: Delivery = { id: randomUUID(), tenantId: access.tenant.id, workerId: current.worker.id, companyId: current.company.id, unitId: current.unit.id, workerName: current.worker.displayName, workerArea: current.worker.area, companyName: current.company.tradeName || current.company.legalName, unitName: current.unit.name, relatedCnpj: current.unit.cnpj, items, deliveredOn: input.deliveredOn, notes: text(input.notes, "as observações internas", 1200, true), createdAt: now.toISOString(), createdBy: userId, status: "pending", origin: "online", tokenHash: hash(token), expiresAt: new Date(now.getTime() + 24 * 3600000).toISOString(), failedAttempts: 0, events: [] };
  event(delivery, "created", userId); const db = read(); db.deliveries.push(delivery); write(db); audit(delivery, userId, "epi.created");
  return { delivery: summary(delivery), link: `/receber-epi#${token}` };
}
export function createOfflineEpiSubmission(userId: string, input: { clientRequestId: string; workerId: string; deliveredOn: string; items: EpiItem[] }) {
  const access = context(userId, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientRequestId)) throw new Error("Identificador da captura offline inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveredOn) || Number.isNaN(Date.parse(`${input.deliveredOn}T12:00:00Z`)) || new Date(`${input.deliveredOn}T12:00:00Z`).toISOString().slice(0, 10) !== input.deliveredOn) throw new Error("Informe uma data válida para a entrega offline.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) throw new Error("Informe entre 1 e 20 itens para a entrega offline.");
  const dateOrEmpty = (value: string | undefined, label: string) => {
    if (!value) return "";
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Confira ${label} no registro offline.`);
    return value;
  };
  const items = input.items.map(item => {
    if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw new Error("Informe quantidade inteira entre 1 e 1.000 em cada item offline.");
    const ca = text(item.ca ?? "", "o CA", 40, true);
    if (ca && !/^\d{1,8}$/.test(ca)) throw new Error("Confira o número do CA no registro offline.");
    return {
      name: text(item.name, "o nome do item", 120), reference: text(item.reference ?? "", "a referência interna", 80, true),
      size: text(item.size, "o tamanho ou modelo", 60), quantity: item.quantity, ca,
      caValidUntil: dateOrEmpty(item.caValidUntil, "validade informada do CA"),
      caCheckedOn: dateOrEmpty(item.caCheckedOn, "data informada da consulta"),
      manufacturer: text(item.manufacturer ?? "", "o fabricante/importador", 120, true),
      lot: text(item.lot ?? "", "o lote", 80, true), productValidity: dateOrEmpty(item.productValidity, "validade do produto"),
      protectionPurpose: text(item.protectionPurpose ?? "", "finalidade de proteção", 240, true),
      deliveryType: item.deliveryType === "replacement" ? "replacement" as const : "initial" as const,
      replacementReason: text(item.replacementReason ?? "", "motivo da reposição", 240, true),
      instructions: text(item.instructions ?? "", "orientações registradas", 500, true),
      trainingStatus: item.trainingStatus === "provided" || item.trainingStatus === "pending" ? item.trainingStatus : "not_applicable" as const,
      trainingDate: dateOrEmpty(item.trainingDate, "data de treinamento"),
    };
  });
  const db = read();
  db.offlineSubmissions ??= [];
  const previous = db.offlineSubmissions.find(record => record.tenantId === access.tenant.id && record.clientRequestId === input.clientRequestId);
  if (previous) {
    if (previous.workerId !== input.workerId || previous.deliveredOn !== input.deliveredOn || JSON.stringify(previous.items) !== JSON.stringify(items)) throw new Error("Este identificador offline já foi usado com outros dados.");
    return structuredClone(previous);
  }
  rate(`admin:${userId}`);
  const current = scope(access.tenant.id, input.workerId);
  if (!current) throw new Error("O trabalhador não está ativo nesta consultoria e unidade; o registro offline permanece pendente neste dispositivo.");
  const receivedAt = new Date().toISOString();
  const record: OfflineEpiSubmission = {
    id: randomUUID(), clientRequestId: input.clientRequestId, tenantId: access.tenant.id, workerId: current.worker.id,
    companyId: current.company.id, unitId: current.unit.id, workerName: current.worker.displayName,
    companyName: current.company.tradeName || current.company.legalName, unitName: current.unit.name,
    deliveredOn: input.deliveredOn, items, status: "pending_ca_review", createdAt: receivedAt, receivedAt, createdBy: userId,
  };
  db.offlineSubmissions.push(record);
  write(db);
  appendAuditEvent({ tenantId: record.tenantId, actorUserId: userId, actorRole: access.membership.role, action: "epi.offline_synced", targetId: record.id });
  return structuredClone(record);
}
export function listOfflineEpiSubmissions(userId: string): EpiOfflineSubmissionSummary[] {
  const access = context(userId);
  return (read().offlineSubmissions ?? []).filter(record => record.tenantId === access.tenant.id).reverse().map(record => ({
    id: record.id, workerId: record.workerId, companyId: record.companyId, workerName: record.workerName,
    companyName: record.companyName, unitName: record.unitName, deliveredOn: record.deliveredOn,
    items: structuredClone(record.items), status: record.status, receivedAt: record.receivedAt, deliveryId: record.deliveryId,
  }));
}
export function reviewOfflineEpiSubmission(userId: string, submissionId: string, reviewedItems: Array<{ ca: string; caValidUntil: string; caCheckedOn: string }>) {
  const access = context(userId, true);
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error("Identificador de entrega offline inválido.");
  const db = read();
  const submission = (db.offlineSubmissions ?? []).find(record => record.id === submissionId && record.tenantId === access.tenant.id);
  if (!submission) throw new Error("Registro offline indisponível nesta consultoria.");
  if (submission.status === "delivery_created" && submission.deliveryId) {
    const existing = db.deliveries.find(delivery => delivery.id === submission.deliveryId && delivery.tenantId === access.tenant.id);
    if (existing) return summary(existing);
    throw new Error("O vínculo da ficha revisada está inconsistente; preserve o registro e solicite suporte.");
  }
  if (!Array.isArray(reviewedItems) || reviewedItems.length !== submission.items.length) throw new Error("Confira a revisão do CA de todos os itens.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (submission.deliveredOn > today) throw new Error("A data informada para entrega offline está no futuro; preserve o registro e corrija a data antes de revisar.");
  const reviewed = reviewedItems.map((item, index) => {
    if (!item || typeof item.ca !== "string" || !/^\d{1,8}$/.test(item.ca.trim())) throw new Error(`Informe o número do CA consultado no item ${index + 1}.`);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(item.caValidUntil) || !validDate(item.caCheckedOn) || item.caCheckedOn > today || item.caCheckedOn < new Date(Date.parse(`${today}T12:00:00Z`) - 15 * 86400000).toISOString().slice(0, 10)) throw new Error(`Informe consulta manual do CA realizada nos últimos 15 dias no item ${index + 1}.`);
    if (item.caValidUntil < today) throw new Error(`Revisão bloqueada: o CA do item ${index + 1} está vencido.`);
    return { ...submission.items[index], ca: item.ca.trim(), caValidUntil: item.caValidUntil, caCheckedOn: item.caCheckedOn };
  });
  const current = scope(access.tenant.id, submission.workerId);
  if (!current || current.company.id !== submission.companyId || current.unit.id !== submission.unitId) throw new Error("O trabalhador ou vínculo mudou. A revisão não pode ser concluída; preserve o registro para ajuste.");
  rate(`admin:${userId}`);
  const now = new Date();
  const delivery: Delivery = {
    id: randomUUID(), tenantId: access.tenant.id, workerId: current.worker.id, companyId: current.company.id, unitId: current.unit.id,
    workerName: submission.workerName, workerArea: current.worker.area, companyName: submission.companyName, unitName: submission.unitName,
    relatedCnpj: current.unit.cnpj, items: reviewed, deliveredOn: submission.deliveredOn,
    notes: "Registro originado de captura offline; CA conferido manualmente após sincronização. Não representa consulta automática nem confirmação de identidade.",
    createdAt: now.toISOString(), createdBy: submission.createdBy, status: "offline_recorded", origin: "offline",
    offlineSubmissionId: submission.id, tokenHash: hash(randomBytes(32).toString("hex")), expiresAt: now.toISOString(),
    failedAttempts: 0, events: [],
  };
  event(delivery, "offline_reviewed", userId);
  submission.status = "delivery_created"; submission.deliveryId = delivery.id;
  submission.reviewedAt = now.toISOString(); submission.reviewedBy = userId;
  db.deliveries.push(delivery);
  write(db);
  audit(delivery, userId, "epi.offline_reviewed");
  return summary(delivery);
}
export function listEpiDeliveries(userId: string): EpiDelivery[] {
  const access = context(userId); return read().deliveries.filter(d => d.tenantId === access.tenant.id).map(d => { audit(d, userId, "epi.read"); return summary(d); }).reverse();
}
export function getEpiDeliveryForStock(userId:string,id:string):EpiDelivery|null {
  const access=context(userId,true);
  const delivery=read().deliveries.find(record=>record.id===id&&record.tenantId===access.tenant.id);
  return delivery?summary(delivery):null;
}
export function openEpiPortal(token: string): EpiPortal {
  const delivery = resolve(read(), token, true); return portal(delivery);
}
export function issueEpiMockCode(token: string) {
  const db = read(), delivery = resolve(db, token);
  assertModuleEnabled(delivery.tenantId, "epi");
  if (delivery.failedAttempts >= 5) throw new Error("Limite de tentativas atingido. Peça à administradora um novo link local.");
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  delivery.challenge = { hash: hash(`${delivery.tokenHash}:${code}`), expiresAt: new Date(Date.now() + 5 * 60000).toISOString() };
  event(delivery, "code_issued", `invite:${delivery.id}`); write(db); audit(delivery, `invite:${delivery.id}`, "epi.code_issued");
  return { code, expiresAt: delivery.challenge.expiresAt, portal: portal(delivery) };
}
export function confirmEpiMock(token: string, code: string, acknowledged: boolean): EpiPortal {
  const db = read(), delivery = resolve(db, token, true);
  if (delivery.status === "confirmed") return portal(delivery); // Retry idempotente, sem novo comprovante ou evento.
  assertModuleEnabled(delivery.tenantId, "epi");
  if (acknowledged !== true) throw new Error("Marque a confirmação de simulação após conferir os itens fictícios.");
  if (delivery.failedAttempts >= 5) throw new Error("Limite de tentativas atingido. Peça à administradora um novo link local.");
  if (!delivery.challenge || Date.parse(delivery.challenge.expiresAt) <= Date.now()) throw new Error("Código ausente ou expirado. Gere outro código fictício.");
  const matches = typeof code === "string" && /^\d{6}$/.test(code) && timingSafeEqual(Buffer.from(delivery.challenge.hash, "hex"), Buffer.from(hash(`${delivery.tokenHash}:${code}`), "hex"));
  if (!matches) {
    delivery.failedAttempts++; event(delivery, "code_failed", `invite:${delivery.id}`); write(db); audit(delivery, `invite:${delivery.id}`, "epi.code_failed");
    throw new Error(delivery.failedAttempts >= 5 ? "Limite de tentativas atingido. Peça à administradora um novo link local." : "Código incorreto. Confira o código fictício exibido.");
  }
  delivery.status = "confirmed";
  delivery.confirmation = { protocol: randomUUID(), confirmedAt: new Date().toISOString(), deliveryDigest: deliveryDigest(delivery), mode: "mock", statement: EPI_DEMO_STATEMENT, statementVersion: "demo-v1" };
  delete delivery.challenge; event(delivery, "confirmed", `invite:${delivery.id}`); write(db); audit(delivery, `invite:${delivery.id}`, "epi.confirmed"); return portal(delivery);
}
export function renewEpiLink(userId: string, id: string) {
  const access = context(userId, true); rate(`admin:${userId}`); const db = read();
  const delivery = db.deliveries.find(d => d.id === id && d.tenantId === access.tenant.id && d.status === "pending");
  if (!delivery || !activeScope(delivery)) throw new Error("Entrega indisponível para novo link.");
  const token = randomBytes(32).toString("hex"); delivery.tokenHash = hash(token); delivery.expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  delete delivery.challenge; delivery.failedAttempts = 0; event(delivery, "link_renewed", userId); write(db); audit(delivery, userId, "epi.link_renewed");
  return { link: `/receber-epi#${token}` };
}
export function cancelEpiDelivery(userId: string, id: string, reason: string) {
  const access = context(userId, true); rate(`admin:${userId}`); const db = read();
  const delivery = db.deliveries.find(d => d.id === id && d.tenantId === access.tenant.id && d.status === "pending");
  if (!delivery) throw new Error("Somente entregas pendentes desta consultoria podem ser canceladas.");
  const safeReason = text(reason, "o motivo do cancelamento", 600); delivery.status = "canceled"; delete delivery.challenge;
  event(delivery, "canceled", userId, safeReason); write(db); audit(delivery, userId, "epi.canceled");
}
export function readEpiReceipt(userId: string, id: string): EpiDelivery | null {
  const access = context(userId); const delivery = read().deliveries.find(d => d.id === id && d.tenantId === access.tenant.id && d.status === "confirmed" && d.confirmation);
  if (!delivery) return null;
  audit(delivery, userId, "epi.receipt_read"); return summary(delivery);
}
