import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOperationsOverview, setOperationalDeadline, setNotificationPreferences, markOperationalNoticeRead, operationalToday } from "../src/lib/operations-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
const original = process.cwd(), admin = "sst-demo-user", sst = "sst-demo-sst", other = "sst-demo-user-b";
const today = operationalToday();
function file(name: string) { return join(process.cwd(), "data", name); }
function save(name: string, value: unknown) { writeFileSync(file(name), JSON.stringify(value)); }
function load(name: string) { return JSON.parse(readFileSync(file(name), "utf8")); }
function offset(days: number) { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
beforeEach(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "operations-tests-"))); mkdirSync("data");
  save("clients.json", [{ id: "company-a", tenantId: "tenant-horizonte", status: "active", units: [{ id: "unit-a" }] }, { id: "company-b", tenantId: "tenant-aurora", status: "active", units: [{ id: "unit-b" }] }]);
  save("third-party.json", { invitations: [{ id: "invite-a", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", contractorName: "Contratada fictícia A", companyName: "Cliente A", unitName: "Unidade A", requested: ["PGR", "LTCAT"], receipts: [{ id: "receipt-a", kind: "PGR" }], tokenHash: "SEGREDO_NAO_EXIBIR", issues: [{ id: "issue-a", kind: "PGR", currentReceiptId: "receipt-a", status: "open", revision: 1, reason: "MOTIVO_INTERNO_NAO_EXIBIR", events: [] }] }, { id: "invite-b", tenantId: "tenant-aurora", companyId: "company-b", unitId: "unit-b", contractorName: "CONTRATADA_OUTRO_TENANT", requested: ["PGR"], receipts: [] }] });
  save("epi.json", { deliveries: [{ id: "epi-a", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", status: "pending", workerName: "Trabalhador fictício A", companyName: "Cliente A", unitName: "Unidade A", notes: "EPI_INTERNO_NAO_EXIBIR", tokenHash: "SEGREDO_EPI_NAO_EXIBIR" }, { id: "epi-done", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", status: "confirmed" }] });
  save("documents.json", [{ id: "doc-a", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", title: "PGR fictício A", kind: "PGR", version: 1, validUntil: today, status: "received" }, { id: "clinical", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", title: "SAUDE_NAO_EXIBIR", kind: "ASO", validUntil: today, status: "received" }]);
  save("compliance.json", { evaluations: [{ id: "eval-a", tenantId: "tenant-horizonte", documentId: "doc-a", documentKind: "PGR", documentTitle: "PGR fictício A", ruleId: "rule-a", ruleTitle: "Critério fictício", result: "pendente", evaluatedAt: "2026-01-01T00:00:00Z", evidence: "EVIDENCIA_INTERNA_NAO_EXIBIR" }] });
});
afterEach(() => process.chdir(original));
test("operação: escopo/permissão e projeção excluem conteúdo clínico, segredos e evidências", () => {
  for (const user of ["", "desconhecido", "sst-demo-medico"]) assert.throws(() => getOperationsOverview(user));
  const overview = getOperationsOverview(admin); assert.equal(overview.tasks.length, 5);
  for (const text of ["CONTRATADA_OUTRO_TENANT", "SAUDE_NAO_EXIBIR", "SEGREDO_NAO_EXIBIR", "EPI_INTERNO_NAO_EXIBIR", "EVIDENCIA_INTERNA_NAO_EXIBIR", "MOTIVO_INTERNO_NAO_EXIBIR"]) assert.equal(JSON.stringify(overview).includes(text), false);
  assert.equal(getOperationsOverview(other).tasks.length, 1);
  assert.equal(getOperationsOverview(sst).tasks.length, 5);
});
test("operação: datas de Brasília são determinísticas na virada UTC", () => {
  assert.equal(operationalToday(new Date("2026-10-10T02:30:00Z")), "2026-10-09");
  assert.equal(operationalToday(new Date("2026-10-10T03:00:00Z")), "2026-10-10");
});
test("operação: prazo interno exige administradora/tarefa do tenant e mantém histórico", () => {
  assert.throws(() => setOperationalDeadline(sst, "issue:issue-a", today, "Motivo fictício"));
  assert.throws(() => setOperationalDeadline(other, "issue:issue-a", today, "Motivo fictício"));
  assert.throws(() => setOperationalDeadline(admin, "issue:issue-a", "2026-02-30", "Motivo fictício"));
  assert.throws(() => setOperationalDeadline(admin, "issue:issue-a", today, ""));
  setOperationalDeadline(admin, "issue:issue-a", today, "Data combinada internamente");
  assert.equal(getOperationsOverview(admin).tasks.find(t => t.key === "issue:issue-a")!.priority, "today");
  setOperationalDeadline(admin, "issue:issue-a", offset(-1), "Data fictícia ultrapassada");
  assert.equal(getOperationsOverview(admin).tasks[0].key, "issue:issue-a");
  setOperationalDeadline(admin, "issue:issue-a", "", "Retirar data interna");
  const overview = getOperationsOverview(admin);
  assert.equal(overview.tasks.find(t => t.key === "issue:issue-a")!.priority, "undated");
  assert.equal(overview.deadlines.length, 3);
  assert.equal(load("documents.json")[0].validUntil, today);
  setOperationalDeadline(admin, "validity:doc-a", offset(2), "Prazo interno para conferência");
  setOperationalDeadline(admin, "validity:doc-a", "", "Remover prazo e manter validade cadastrada");
  assert.equal(getOperationsOverview(admin).tasks.find(t => t.key === "validity:doc-a")!.dueOn, today);
});
test("operação: deduplicação e leitura são por usuário e preservadas após atualização", () => {
  const first = getOperationsOverview(admin); assert.equal(first.notices.length, 5);
  assert.equal(getOperationsOverview(admin).notices.length, 5);
  const notice = first.notices[0];
  assert.throws(() => markOperationalNoticeRead(sst, notice.id)); assert.throws(() => markOperationalNoticeRead(other, notice.id));
  markOperationalNoticeRead(admin, notice.id);
  assert.equal(getOperationsOverview(admin).notices.length, 5);
  assert.ok(getOperationsOverview(admin).notices.find(n => n.id === notice.id)!.readAt);
  assert.equal(getOperationsOverview(sst).notices.every(n => !n.readAt), true);
});
test("operação: preferências silenciam novos avisos sem ocultar tarefas ou outras contas", () => {
  setNotificationPreferences(admin, { enabled: false, categories: ["epi"], lookaheadDays: 0 });
  let overview = getOperationsOverview(admin); assert.equal(overview.tasks.length, 5); assert.equal(overview.notices.length, 0);
  setNotificationPreferences(admin, { enabled: true, categories: ["epi"], lookaheadDays: 0 });
  overview = getOperationsOverview(admin); assert.equal(overview.notices.length, 1); assert.equal(overview.notices[0].category, "epi");
  assert.equal(getOperationsOverview(sst).notices.length, 5);
  assert.throws(() => setNotificationPreferences(admin, { enabled: true, categories: ["epi", "epi"], lookaheadDays: 7 }));
  assert.throws(() => setNotificationPreferences(admin, { enabled: true, categories: ["epi"], lookaheadDays: 31 }));
});
test("operação: antecedência técnica controla datas futuras e transições não apagam avisos", () => {
  const documents = load("documents.json"); documents[0].validUntil = offset(10); save("documents.json", documents);
  assert.equal(getOperationsOverview(admin).notices.length, 4);
  setNotificationPreferences(admin, { enabled: true, categories: ["thirdparty", "documents", "epi"], lookaheadDays: 15 });
  assert.equal(getOperationsOverview(admin).notices.length, 5);
  const db = load("third-party.json"); db.invitations[0].issues[0].status = "awaiting_review"; db.invitations[0].issues[0].currentReceiptId = "receipt-new"; save("third-party.json", db);
  let overview = getOperationsOverview(admin); assert.equal(overview.notices.length, 6);
  assert.equal(overview.notices.filter(n => n.taskKey === "issue:issue-a" && n.endedAt).length, 1);
  db.invitations[0].issues[0].status = "resolved"; save("third-party.json", db);
  overview = getOperationsOverview(admin); assert.equal(overview.tasks.some(t => t.key === "issue:issue-a"), false);
  assert.equal(overview.notices.filter(n => n.taskKey === "issue:issue-a").every(n => !!n.endedAt), true);
});
test("operação: recebimento, avaliação atual e arquivamento removem somente tarefas ativas", () => {
  getOperationsOverview(admin);
  const invites = load("third-party.json"); invites.invitations[0].receipts.push({ id: "ltcat-a", kind: "LTCAT" }); save("third-party.json", invites);
  const evaluations = load("compliance.json"); evaluations.evaluations.push({ ...evaluations.evaluations[0], id: "eval-new", result: "atende", evaluatedAt: "2026-02-01T00:00:00Z" }); save("compliance.json", evaluations);
  let overview = getOperationsOverview(admin); assert.equal(overview.tasks.length, 3); assert.equal(overview.notices.filter(n => !!n.endedAt).length, 2);
  const clients = load("clients.json"); clients[0].status = "archived"; save("clients.json", clients);
  overview = getOperationsOverview(admin); assert.equal(overview.tasks.length, 0); assert.equal(overview.notices.length, 5);
});
test("operação: auditoria registra ações sem conteúdo das tarefas ou justificativas", () => {
  const overview = getOperationsOverview(admin); markOperationalNoticeRead(admin, overview.notices[0].id);
  setOperationalDeadline(admin, "epi:epi-a", today, "JUSTIFICATIVA_NAO_NA_AUDITORIA");
  setNotificationPreferences(admin, { enabled: false, categories: [], lookaheadDays: 0 });
  const events = listAuditEventsForTenant("tenant-horizonte");
  for (const action of ["operations.notice_created", "operations.notice_read", "operations.deadline_set", "operations.preferences_set"]) assert.equal(events.some(e => e.action === action), true);
  assert.equal(JSON.stringify(events).includes("JUSTIFICATIVA_NAO_NA_AUDITORIA"), false);
  assert.deepEqual(listAuditEventsForTenant("tenant-aurora"), []);
});

test("operação: prazo da correção vem da pendência e não vira prazo de reavaliação", () => {
  const db = load("third-party.json");
  const issue = db.invitations[0].issues[0];
  issue.correctionPeriod = { startedOn: offset(-4), dueOn: offset(-1), calendarDays: 3, timeZone: "America/Sao_Paulo" };
  save("third-party.json", db);
  let task = getOperationsOverview(admin).tasks.find(t => t.key === `issue:${issue.id}`)!;
  assert.equal(task.dueOn, offset(-1));
  assert.equal(task.priority, "overdue");
  assert.throws(() => setOperationalDeadline(admin, task.key, offset(5), "alterar ciclo"), /prazo de correção/);
  issue.status = "awaiting_review";
  save("third-party.json", db);
  task = getOperationsOverview(admin).tasks.find(t => t.key === `issue:${issue.id}`)!;
  assert.equal(task.dueOn, "");
  assert.equal(task.priority, "undated");
});
