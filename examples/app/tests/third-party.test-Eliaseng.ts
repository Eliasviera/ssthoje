import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createThirdPartyInvitation, listThirdPartyInvitations, revokeThirdPartyInvitation, openThirdPartyPortal, receiveThirdPartyPdf, readThirdPartyPdf, getThirdPartyDocumentForReview } from "../src/lib/third-party-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";
import { hasTenantPermission } from "../src/lib/tenant-access.ts";

const original = process.cwd(), admin = "sst-demo-user", sst = "sst-demo-sst";
const input = { companyId: "cliente-ficticio", unitId: "unidade-ficticia", contractorName: "Contratada fictícia M11", contractorCnpj: "11111111000111", scope: "Montagem de estruturas fictícia", requested: ["PGR", "PCMSO", "Ficha de EPI"], medicalAsoRequired: true, expiresInHours: 24 };
const bytes = new TextEncoder().encode("%PDF-1.4\nPDF fictício usado somente para testar armazenamento de bytes.\n%%EOF");
let token: string, invitationId: string, receiptId: string;
function file(name: string) { return join(process.cwd(), "data", name); }
before(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "thirdparty-tests-")));
  mkdirSync(file("."), { recursive: true });
  writeFileSync(file("clients.json"), JSON.stringify([
    { id: input.companyId, tenantId: "tenant-horizonte", tradeName: "Cliente fictício", status: "active", units: [{ id: input.unitId, name: "Unidade fictícia", cnpj: "12345678000195" }] },
    { id: "cliente-aurora", tenantId: "tenant-aurora", tradeName: "Cliente Aurora fictício", status: "active", units: [{ id: "unidade-aurora", name: "Unidade Aurora", cnpj: "22222222000122" }] },
  ]));
});
after(() => process.chdir(original));
test("terceiros: autorização de criação/leitura e isolamento do cliente no servidor", () => {
  for (const user of ["", "desconhecido", sst, "sst-demo-medico"]) assert.throws(() => createThirdPartyInvitation(user, input));
  assert.equal(hasTenantPermission("saas_master", "thirdparty.read"), false);
  assert.equal(hasTenantPermission("terceiro", "thirdparty.read"), false);
  assert.throws(() => listThirdPartyInvitations("sst-demo-medico"));
  assert.throws(() => createThirdPartyInvitation("sst-demo-user-b", input), /unidade ativas/);
  assert.throws(() => createThirdPartyInvitation(admin, { ...input, unitId: "unidade-aurora" }), /unidade ativas/);
  assert.throws(() => createThirdPartyInvitation(admin, { ...input, contractorCnpj: "123" }));
  assert.throws(() => createThirdPartyInvitation(admin, { ...input, requested: ["ASO"] }));
  assert.throws(() => createThirdPartyInvitation(admin, { ...input, requested: ["PGR", "PGR"] }));
  assert.throws(() => createThirdPartyInvitation(admin, { ...input, expiresInHours: 0 }));
  const created = createThirdPartyInvitation(admin, input);
  token = created.link.split("#")[1]; invitationId = created.invitation.id;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(readFileSync(file("third-party.json"), "utf8").includes(token), false);
  assert.equal(JSON.stringify(listThirdPartyInvitations(admin)).includes("tokenHash"), false);
  assert.equal(listThirdPartyInvitations(admin)[0].medicalAsoRequired, true);
  assert.equal(listThirdPartyInvitations(sst).length, 1);
  assert.deepEqual(listThirdPartyInvitations("sst-demo-user-b"), []);
});
test("terceiros: portal não retorna dados internos nem convites alheios", () => {
  assert.throws(() => openThirdPartyPortal("")); assert.throws(() => openThirdPartyPortal("0".repeat(64)));
  const portal = openThirdPartyPortal(token);
  assert.equal(portal.contractorName, input.contractorName);
  assert.deepEqual(portal.requested, input.requested);
  assert.equal("medicalAsoRequired" in portal, false);
  for (const key of ["tenantId", "companyId", "unitId", "tokenHash", "id", "storageName"]) assert.equal(key in portal, false);
  assert.equal(JSON.stringify(portal).includes("tenant-aurora"), false);
});
test("terceiros: PDF, tamanho, categoria e reenvio são validados", () => {
  assert.throws(() => receiveThirdPartyPdf(token, "LTCAT", "teste.pdf", bytes), /não solicitada/);
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "teste.exe", bytes), /PDF/);
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "teste.pdf", new Uint8Array(0)), /PDF/);
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "teste.pdf", new TextEncoder().encode("não é PDF")), /PDF/);
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "teste.pdf", new Uint8Array(7 * 1024 * 1024 + 1)), /PDF/);
  const portal = receiveThirdPartyPdf(token, "PGR", "../../pgr-ficticio.pdf", bytes);
  assert.equal(portal.receipts.length, 1); receiptId = portal.receipts[0].id;
  assert.equal(portal.receipts[0].fileName, "pgr-ficticio.pdf");
  assert.equal(portal.receipts[0].digest, createHash("sha256").update(bytes).digest("hex"));
  assert.equal("storageName" in portal.receipts[0], false);
  assert.deepEqual(getThirdPartyDocumentForReview(sst, receiptId), { id: receiptId, title: `PGR da contratada ${input.contractorName}`, kind: "PGR", version: 1, companyId: input.companyId, unitId: input.unitId, companyName: "Cliente fictício", unitName: "Unidade fictícia", contractorName: input.contractorName });
  assert.equal(getThirdPartyDocumentForReview("sst-demo-user-b", receiptId), null);
  assert.throws(() => getThirdPartyDocumentForReview("sst-demo-medico", receiptId), /Revisão de terceiros não autorizada/);
  assert.throws(() => receiveThirdPartyPdf(token, "PGR", "reenvio.pdf", bytes), /já recebida/);
  assert.equal(listThirdPartyInvitations(admin)[0].receipts.length, 1);
});
test("terceiros: novo PGR da mesma contratada substitui a versão atual sem apagar o histórico", () => {
  const replacement = createThirdPartyInvitation(admin, { ...input, requested: ["PGR"] });
  const replacementToken = replacement.link.split("#")[1];
  const newer = receiveThirdPartyPdf(replacementToken, "PGR", "pgr-renovado.pdf", bytes).receipts[0];
  assert.equal(newer.replacesReceiptId, receiptId);
  assert.throws(() => getThirdPartyDocumentForReview(sst, receiptId), /versão atual/);
  assert.equal(getThirdPartyDocumentForReview(sst, newer.id)?.version, 2);
  assert.equal(readThirdPartyPdf(admin, receiptId)?.fileName, "pgr-ficticio.pdf");
  assert.equal(readThirdPartyPdf(admin, newer.id)?.fileName, "pgr-renovado.pdf");
});
test("terceiros: download exige perfil autorizado e consultoria do recebimento", () => {
  assert.deepEqual(new Uint8Array(readThirdPartyPdf(admin, receiptId)!.bytes), bytes);
  assert.equal(readThirdPartyPdf(sst, receiptId)?.fileName, "pgr-ficticio.pdf");
  assert.equal(readThirdPartyPdf("sst-demo-user-b", receiptId), null);
  assert.equal(readThirdPartyPdf(admin, "../../arquivo"), null);
  for (const user of ["", "desconhecido", "sst-demo-medico"]) assert.throws(() => readThirdPartyPdf(user, receiptId));
});
test("terceiros: revogação impede leitura e envio sem apagar recebimentos", () => {
  assert.throws(() => revokeThirdPartyInvitation(sst, invitationId));
  assert.throws(() => revokeThirdPartyInvitation("sst-demo-user-b", invitationId));
  revokeThirdPartyInvitation(admin, invitationId);
  assert.throws(() => openThirdPartyPortal(token), /indisponível/);
  assert.throws(() => receiveThirdPartyPdf(token, "Treinamento", "teste.pdf", bytes), /indisponível/);
  assert.equal(listThirdPartyInvitations(admin).find((invite) => invite.id === invitationId)?.linkStatus, "revoked");
  assert.equal(readThirdPartyPdf(admin, receiptId)?.bytes.length, bytes.length);
});
test("terceiros: expiração técnica e empresa arquivada bloqueiam portal", () => {
  const created = createThirdPartyInvitation(admin, input), expiredToken = created.link.split("#")[1];
  const db = JSON.parse(readFileSync(file("third-party.json"), "utf8"));
  db.invitations.find((i: { id: string }) => i.id === created.invitation.id).expiresAt = "2000-01-01T00:00:00Z";
  writeFileSync(file("third-party.json"), JSON.stringify(db));
  assert.throws(() => openThirdPartyPortal(expiredToken), /indisponível/);
  assert.throws(() => receiveThirdPartyPdf(expiredToken, "PGR", "teste.pdf", bytes), /indisponível/);
  const active = createThirdPartyInvitation(admin, input);
  const savedClients = readFileSync(file("clients.json"), "utf8");
  const clients = JSON.parse(savedClients); clients[0].status = "archived"; writeFileSync(file("clients.json"), JSON.stringify(clients));
  assert.throws(() => openThirdPartyPortal(active.link.split("#")[1]), /indisponível/);
  writeFileSync(file("clients.json"), savedClients);
});
test("terceiros: auditoria não inclui token nem bytes do documento", () => {
  const events = listAuditEventsForTenant("tenant-horizonte");
  assert.equal(events.some(e => e.action === "thirdparty.received" && e.targetId === receiptId && e.actorRole === "terceiro"), true);
  assert.equal(events.some(e => e.action === "thirdparty.revoked"), true);
  assert.equal(JSON.stringify(events).includes(token), false);
  assert.equal(JSON.stringify(events).includes("PDF fictício usado"), false);
  assert.deepEqual(listAuditEventsForTenant("tenant-aurora"), []);
});
test("terceiros: limite de consultas do convite é aplicado", () => {
  const created = createThirdPartyInvitation(admin, input), activeToken = created.link.split("#")[1];
  let limited = false;
  for (let i = 0; i < 31; i++) {
    try { openThirdPartyPortal(activeToken); } catch (error) { if (error instanceof Error && error.message.includes("Muitas solicitações")) { limited = true; break; } }
  }
  assert.equal(limited, true);
});
