import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createEpiDelivery, createOfflineEpiSubmission, reviewOfflineEpiSubmission, listOfflineEpiSubmissions, listEpiDeliveries, listEpiWorkers, openEpiPortal, issueEpiMockCode, confirmEpiMock, renewEpiLink, cancelEpiDelivery, readEpiReceipt } from "../src/lib/epi-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
import { hasTenantPermission } from "../src/lib/tenant-access.ts";

const original = process.cwd(), admin = "sst-demo-user", sst = "sst-demo-sst", other = "sst-demo-user-b";
const item = { name: "Luva fictícia", reference: "REFERENCIA-TESTE", size: "M", quantity: 2, ca: "99999999", caValidUntil: "2030-10-10", caCheckedOn: "2026-10-10" };
const input = { workerId: "worker-a", deliveredOn: "2026-10-10", items: [item], notes: "OBSERVACAO_INTERNA_EPI" };
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const shiftDate = (value: string, offset: number) => new Date(Date.parse(`${value}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const file = (name: string) => join(process.cwd(), "data", name);
before(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "epi-tests-"))); mkdirSync("data");
  writeFileSync(file("clients.json"), JSON.stringify([
    { id: "company-a", tenantId: "tenant-horizonte", tradeName: "Cliente fictício A", status: "active", units: [{ id: "unit-a", name: "Unidade fictícia A", cnpj: "12345678000195" }] },
    { id: "company-b", tenantId: "tenant-aurora", tradeName: "Cliente fictício B", status: "active", units: [{ id: "unit-b", name: "Unidade fictícia B", cnpj: "22222222000122" }] },
  ]));
  writeFileSync(file("workers.json"), JSON.stringify([
    { id: "worker-a", tenantId: "tenant-horizonte", companyId: "company-a", unitId: "unit-a", displayName: "Trabalhador fictício A", status: "active", jobTitle: "Função fictícia", riskCategories: ["risco-restrito"] },
    { id: "worker-b", tenantId: "tenant-aurora", companyId: "company-b", unitId: "unit-b", displayName: "Trabalhador fictício B", status: "active" },
    { id: "worker-forged", tenantId: "tenant-horizonte", companyId: "company-b", unitId: "unit-b", displayName: "Vínculo inconsistente fictício", status: "active" },
  ]));
});
after(() => process.chdir(original));
function fixture() { const created = createEpiDelivery(admin, input); return { ...created, token: created.link.split("#")[1] }; }
function changeDatabase(change: (db: { deliveries: Array<{ id: string; expiresAt: string; challenge?: { expiresAt: string; hash: string }; failedAttempts: number }> }) => void) {
  const db = JSON.parse(readFileSync(file("epi.json"), "utf8")); change(db); writeFileSync(file("epi.json"), JSON.stringify(db));
}
test("EPI: autorização e vínculo de trabalhador/unidade são verificados no servidor", () => {
  for (const user of ["", "desconhecido", sst, "sst-demo-medico", other]) assert.throws(() => createEpiDelivery(user, input));
  for (const role of ["cliente", "terceiro", "medico_coordenador", "saas_master"]) assert.equal(hasTenantPermission(role, "epi.read"), false);
  assert.throws(() => createEpiDelivery(admin, { ...input, workerId: "worker-b" }));
  assert.throws(() => createEpiDelivery(admin, { ...input, workerId: "worker-forged" }));
  assert.throws(() => listEpiWorkers(sst)); assert.throws(() => listEpiDeliveries("sst-demo-medico"));
  assert.deepEqual(listEpiWorkers(admin).map(w => w.id), ["worker-a"]);
  assert.equal(JSON.stringify(listEpiWorkers(admin)).includes("riskCategories"), false);
});
test("EPI offline: registro fica separado, tenant-scoped e idempotente sem confirmar CA ou criar ficha", () => {
  const clientRequestId = "bc68c9ce-9472-4c8b-9f98-005a4137c951";
  const offlineInput = { clientRequestId, workerId: "worker-a", deliveredOn: "2026-10-10", items: [{ name: "Capacete fictício", reference: "", size: "Único", quantity: 1 }] };
  assert.throws(() => createOfflineEpiSubmission(sst, offlineInput), /não autorizado/i);
  const first = createOfflineEpiSubmission(admin, offlineInput);
  const retry = createOfflineEpiSubmission(admin, offlineInput);
  assert.equal(first.id, retry.id); assert.equal(first.receivedAt, retry.receivedAt);
  assert.equal(first.status, "pending_ca_review");
  assert.equal(first.items[0].ca, "");
  assert.equal("confirmation" in first, false);
  assert.equal("link" in first, false);
  assert.equal(listEpiDeliveries(admin).length, 0);
  assert.deepEqual(listOfflineEpiSubmissions(admin).map(record => record.id), [first.id]);
  assert.deepEqual(listOfflineEpiSubmissions(other), []);
  assert.throws(() => createOfflineEpiSubmission(admin, { ...offlineInput, items: [{ ...offlineInput.items[0], quantity: 2 }] }), /já foi usado/i);
  assert.throws(() => createOfflineEpiSubmission(admin, { ...offlineInput, clientRequestId: "bc68c9ce-9472-4c8b-9f98-005a4137c952", workerId: "worker-b" }), /trabalhador não está ativo/i);
  assert.equal(createOfflineEpiSubmission(other, { ...offlineInput, workerId: "worker-b" }).tenantId, "tenant-aurora");
  assert.deepEqual(listOfflineEpiSubmissions(admin).map(record => record.id), [first.id]);
  assert.equal("tenantId" in listOfflineEpiSubmissions(admin)[0], false);
  const events = listAuditEventsForTenant("tenant-horizonte");
  assert.equal(events.filter(event => event.action === "epi.offline_synced" && event.targetId === first.id).length, 1);
  assert.equal(JSON.stringify(events).includes("Capacete fictício"), false);
});
test("EPI offline: entrada inválida e data de CA inválida não viram pendências", () => {
  const before = listOfflineEpiSubmissions(admin).map(record => record.id);
  const base = { clientRequestId: "bc68c9ce-9472-4c8b-9f98-005a4137c953", workerId: "worker-a", deliveredOn: "2026-10-10", items: [{ name: "Óculos fictícios", reference: "", size: "Único", quantity: 1 }] };
  assert.throws(() => createOfflineEpiSubmission(admin, { ...base, deliveredOn: "2026-02-30" }));
  assert.throws(() => createOfflineEpiSubmission(admin, { ...base, clientRequestId: "inválido" }));
  assert.throws(() => createOfflineEpiSubmission(admin, { ...base, items: [{ ...base.items[0], quantity: 1.5 }] }));
  assert.throws(() => createOfflineEpiSubmission(admin, { ...base, items: [{ ...base.items[0], ca: "ABC", caValidUntil: "2030-01-01" }] }));
  assert.throws(() => createOfflineEpiSubmission(admin, { ...base, items: [{ ...base.items[0], caValidUntil: "2030-02-30" }] }));
  assert.deepEqual(listOfflineEpiSubmissions(admin).map(record => record.id), before);
});
test("EPI offline: revisão manual bloqueia consulta antiga ou CA vencido e cria ficha identificada uma única vez", () => {
  const pending = createOfflineEpiSubmission(admin, {
    clientRequestId: "bc68c9ce-9472-4c8b-9f98-005a4137c954",
    workerId: "worker-a",
    deliveredOn: today(),
    items: [{ name: "Capacete fictício", reference: "", size: "Único", quantity: 1 }],
  });
  assert.throws(() => reviewOfflineEpiSubmission(admin, pending.id, [{ ca: "32546", caValidUntil: day(30), caCheckedOn: day(-16) }]), /15 dias/i);
  assert.throws(() => reviewOfflineEpiSubmission(admin, pending.id, [{ ca: "32546", caValidUntil: day(-1), caCheckedOn: today() }]), /vencido/i);
  const created = reviewOfflineEpiSubmission(admin, pending.id, [{ ca: "32546", caValidUntil: day(30), caCheckedOn: today() }]);
  assert.equal(created.status, "offline_recorded");
  assert.equal(created.origin, "offline");
  assert.equal(created.items[0].ca, "32546");
  assert.equal(created.items[0].caCheckedOn, today());
  assert.equal("confirmation" in created, false);
  assert.equal(reviewOfflineEpiSubmission(admin, pending.id, [{ ca: "99999", caValidUntil: day(30), caCheckedOn: today() }]).id, created.id);
  const reviewedSubmission = listOfflineEpiSubmissions(admin).find(record => record.id === pending.id)!;
  assert.equal(reviewedSubmission.status, "delivery_created");
  assert.equal(reviewedSubmission.deliveryId, created.id);
  assert.equal(listEpiDeliveries(admin).filter(delivery => delivery.id === created.id).length, 1);
  assert.equal(listAuditEventsForTenant("tenant-horizonte").filter(event => event.action === "epi.offline_reviewed" && event.targetId === created.id).length, 1);
});
test("EPI: campos, itens e datas inválidas não criam entregas", () => {
  const before = listEpiDeliveries(admin).map(delivery => delivery.id);
  for (const deliveredOn of ["2026-02-30", "2026-13-01", "invalid"]) assert.throws(() => createEpiDelivery(admin, { ...input, deliveredOn }));
  for (const quantity of [0, -1, 1.5, 1001]) assert.throws(() => createEpiDelivery(admin, { ...input, items: [{ ...item, quantity }] }));
  assert.throws(() => createEpiDelivery(admin, { ...input, items: [] }));
  assert.throws(() => createEpiDelivery(admin, { ...input, items: Array.from({ length: 21 }, () => item) }));
  assert.throws(() => createEpiDelivery(admin, { ...input, items: [{ ...item, name: "" }] }));
  assert.throws(() => createEpiDelivery(admin, { ...input, deliveredOn: today(), items: [{ ...item, caCheckedOn: shiftDate(today(), -16), caValidUntil: shiftDate(today(), 30) }] }), /15 dias/i);
  assert.deepEqual(listEpiDeliveries(admin).map(delivery => delivery.id), before);
});
test("EPI: código mock confirma uma vez e preserva comprovante vinculado ao conteúdo", () => {
  const f = fixture(); const mock = issueEpiMockCode(f.token);
  assert.match(mock.code, /^\d{6}$/);
  const stored = JSON.parse(readFileSync(file("epi.json"), "utf8")).deliveries.find((d: { id: string }) => d.id === f.delivery.id);
  assert.equal("code" in stored.challenge, false);
  assert.equal(stored.challenge.hash, createHash("sha256").update(`${stored.tokenHash}:${mock.code}`).digest("hex"));
  assert.equal(readFileSync(file("epi.json"), "utf8").includes(f.token), false);
  const publicView = openEpiPortal(f.token);
  for (const key of ["id", "tenantId", "workerId", "companyId", "unitId", "tokenHash", "challenge", "failedAttempts", "notes", "riskCategories", "events"]) assert.equal(key in publicView, false);
  assert.equal(JSON.stringify(publicView).includes(input.notes), false);
  assert.throws(() => confirmEpiMock(f.token, mock.code, false), /Marque/);
  const confirmed = confirmEpiMock(f.token, mock.code, true);
  assert.equal(confirmed.status, "confirmed"); assert.equal(confirmed.confirmation!.mode, "mock");
  assert.match(confirmed.confirmation!.deliveryDigest, /^[a-f0-9]{64}$/);
  assert.match(confirmed.confirmation!.statement, /não comprova entrega real/);
  assert.equal(confirmEpiMock(f.token, mock.code, true).confirmation!.protocol, confirmed.confirmation!.protocol);
  assert.equal(listEpiDeliveries(sst).find(d => d.id === f.delivery.id)!.events.filter(e => e.action === "confirmed").length, 1);
  assert.throws(() => issueEpiMockCode(f.token)); assert.throws(() => renewEpiLink(admin, f.delivery.id)); assert.throws(() => cancelEpiDelivery(admin, f.delivery.id, "Cancelar confirmação"));
});
test("EPI: cinco erros bloqueiam e gerar códigos não contorna o limite", () => {
  const f = fixture(); const mock = issueEpiMockCode(f.token); const wrong = mock.code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) assert.throws(() => confirmEpiMock(f.token, wrong, true), /Código incorreto|Limite/);
  assert.throws(() => confirmEpiMock(f.token, mock.code, true), /Limite/);
  assert.throws(() => issueEpiMockCode(f.token), /Limite/);
  const renewed = renewEpiLink(admin, f.delivery.id), newToken = renewed.link.split("#")[1];
  assert.throws(() => openEpiPortal(f.token));
  assert.throws(() => confirmEpiMock(newToken, mock.code, true), /ausente/);
  const fresh = issueEpiMockCode(newToken);
  assert.equal(confirmEpiMock(newToken, fresh.code, true).status, "confirmed");
});
test("EPI: expiração técnica de código/link e cadastro arquivado bloqueiam confirmação", () => {
  const f = fixture(), mock = issueEpiMockCode(f.token);
  changeDatabase(db => { db.deliveries.find(d => d.id === f.delivery.id)!.challenge!.expiresAt = "2000-01-01T00:00:00Z"; });
  assert.throws(() => confirmEpiMock(f.token, mock.code, true), /expirado/);
  const fresh = issueEpiMockCode(f.token);
  const workers = readFileSync(file("workers.json"), "utf8"), changed = JSON.parse(workers); changed[0].status = "archived"; writeFileSync(file("workers.json"), JSON.stringify(changed));
  assert.throws(() => openEpiPortal(f.token)); assert.throws(() => confirmEpiMock(f.token, fresh.code, true));
  writeFileSync(file("workers.json"), workers);
  changeDatabase(db => { db.deliveries.find(d => d.id === f.delivery.id)!.expiresAt = "2000-01-01T00:00:00Z"; });
  assert.throws(() => openEpiPortal(f.token)); assert.throws(() => issueEpiMockCode(f.token));
});
test("EPI: cancelamento revoga portal preservando itens e motivo", () => {
  const f = fixture(); const mock = issueEpiMockCode(f.token);
  assert.throws(() => cancelEpiDelivery(sst, f.delivery.id, "Motivo fictício"));
  assert.throws(() => cancelEpiDelivery(other, f.delivery.id, "Motivo fictício"));
  assert.throws(() => renewEpiLink(other, f.delivery.id));
  cancelEpiDelivery(admin, f.delivery.id, "Registro duplicado fictício");
  assert.throws(() => openEpiPortal(f.token)); assert.throws(() => confirmEpiMock(f.token, mock.code, true)); assert.throws(() => renewEpiLink(admin, f.delivery.id));
  const canceled = listEpiDeliveries(sst).find(d => d.id === f.delivery.id)!;
  assert.equal(canceled.status, "canceled"); assert.deepEqual(canceled.items, f.delivery.items);
  assert.equal(canceled.events.at(-1)!.reason, "Registro duplicado fictício");
  assert.equal(readEpiReceipt(admin, f.delivery.id), null);
});
test("EPI: comprovante exige tenant/perfil e mantém snapshot histórico após arquivamento", () => {
  const confirmed = listEpiDeliveries(admin).find(d => d.status === "confirmed")!;
  assert.equal(readEpiReceipt(other, confirmed.id), null); assert.equal(readEpiReceipt(admin, "../../arquivo"), null);
  assert.throws(() => readEpiReceipt("sst-demo-medico", confirmed.id));
  const before = readEpiReceipt(sst, confirmed.id)!;
  const workers = readFileSync(file("workers.json"), "utf8"), changed = JSON.parse(workers); changed[0].displayName = "Nome alterado fictício"; changed[0].status = "archived"; writeFileSync(file("workers.json"), JSON.stringify(changed));
  assert.equal(readEpiReceipt(sst, confirmed.id)!.workerName, "Trabalhador fictício A");
  assert.deepEqual(readEpiReceipt(sst, confirmed.id)!.confirmation, before.confirmation);
  before.items[0].name = "MUTACAO"; before.events[0].action = "canceled";
  assert.equal(readEpiReceipt(sst, confirmed.id)!.items[0].name, item.name);
  for (const key of ["tokenHash", "challenge", "failedAttempts"]) assert.equal(key in before, false);
  writeFileSync(file("workers.json"), workers);
});
test("EPI: auditoria não guarda código, itens, declaração ou observações internas", () => {
  const events = listAuditEventsForTenant("tenant-horizonte");
  for (const action of ["epi.created", "epi.code_issued", "epi.code_failed", "epi.confirmed", "epi.canceled", "epi.link_renewed", "epi.receipt_read"]) assert.equal(events.some(e => e.action === action), true);
  assert.equal(JSON.stringify(events).includes(input.notes), false);
  assert.equal(JSON.stringify(events).includes(item.reference), false);
  assert.equal(JSON.stringify(events).includes("tokenHash"), false);
  const otherTenantEvents = listAuditEventsForTenant("tenant-aurora");
  assert.equal(otherTenantEvents.length, 1);
  assert.equal(otherTenantEvents[0].action, "epi.offline_synced");
  assert.equal(JSON.stringify(otherTenantEvents).includes("Capacete fictício"), false);
});
test("EPI: limite de requisições do portal é aplicado", () => {
  const f = fixture(); for (let i = 0; i < 30; i++) openEpiPortal(f.token);
  assert.throws(() => openEpiPortal(f.token), /Muitas solicitações/);
});
