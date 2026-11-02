import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { DEMO_TENANTS } from "./tenant-access.ts";
import { getTenantSettings, readPlatformState } from "./tenant-state.ts";
import { DEFAULT_PLAN, planTotals } from "./plan-catalog.ts";
import { appendAuditEvent } from "./audit-log.ts";
import { BILLING_ACTIONS, BILLING_STATUS, emptyBillingAccount, type BillingAccount, type BillingCommand, type BillingEvent, type InvoiceStatus } from "./billing-types.ts";

type BillingDB = { accounts: Record<string, BillingAccount> };
function read(): BillingDB {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "billing.json"), "utf8")) as BillingDB; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accounts: {} }; throw error; }
}
function write(db: BillingDB) {
  const path = join(process.cwd(), "data", "billing.json"); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx" }); renameSync(temp, path);
}
export function getBillingOverview(userId: string) {
  requirePlatformMaster(userId);
  appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.billing_read" });
  const db = read();
  return Object.fromEntries(DEMO_TENANTS.map(t => [t.id, db.accounts[t.id] ?? emptyBillingAccount()]));
}
export function manageBilling(userId: string, tenantId: string, command: BillingCommand): { duplicate: boolean; matched?: boolean } {
  requirePlatformMaster(userId); throttle(userId);
  if (!DEMO_TENANTS.some(t => t.id === tenantId)) throw new Error("Consultoria indisponível.");
  if (!command || !Object.hasOwn(BILLING_ACTIONS, command.action) || typeof command.requestId !== "string" || !/^[a-zA-Z0-9:_-]{8,160}$/.test(command.requestId) || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 || typeof command.reason !== "string" || !command.reason.trim() || command.reason.length > 600) throw new Error("Confira a operação e a justificativa fictícia, até 600 caracteres.");
  const db = read(), account = db.accounts[tenantId] ?? emptyBillingAccount();
  const commandHash = createHash("sha256").update(JSON.stringify({ action: command.action, expectedRevision: command.expectedRevision, reason: command.reason.trim(), invoiceId: command.invoiceId ?? "", referenceStatus: command.referenceStatus ?? "", referenceAmountCents: command.referenceAmountCents ?? null, expectedPlanRevision: command.expectedPlanRevision ?? null })).digest("hex");
  const prior = account.events.find(e => e.requestId === command.requestId);
  if (prior) { if (prior.commandHash !== commandHash) throw new Error("Identificador de operação já utilizado com outros valores. Atualize a página."); return { duplicate: true, matched: prior.matched }; }
  if (command.expectedRevision !== account.revision) throw new Error("O ciclo comercial mudou. Atualize a página e revise a operação.");
  const current = account.subscriptions.at(-1), now = new Date().toISOString();
  const event: BillingEvent = { id: randomUUID(), requestId: command.requestId, commandHash, action: command.action, actorUserId: userId, occurredAt: now, reason: command.reason.trim(), before: "", after: "" };
  if (["start", "issue"].includes(command.action)) {
    if (getTenantSettings(tenantId).status !== "active") throw new Error("Reative a consultoria antes de iniciar assinatura ou gerar cobrança.");
    if (account.invoices.some(i => ["pending", "failed", "disputed"].includes(i.status))) throw new Error("Resolva a cobrança pendente, com falha ou em disputa antes de gerar outra.");
    if (command.action === "start" && current?.status === "active") throw new Error("Já existe uma assinatura simulada ativa.");
    if (command.action === "issue" && current?.status !== "active") throw new Error("Inicie uma assinatura antes de gerar a próxima cobrança.");
    const planAccount = readPlatformState().plans?.[tenantId] ?? DEFAULT_PLAN;
    if (!Number.isSafeInteger(command.expectedPlanRevision) || command.expectedPlanRevision !== planAccount.revision) throw new Error("O plano mudou. Atualize a página e revise o valor antes de gerar cobrança.");
    const config = structuredClone(planAccount.config);
    // Somente a base ilustrativa do catálogo. Adicionais ainda não têm preço.
    const amountCents = planTotals(config).price;
    if (command.action === "start") account.subscriptions.push({ id: randomUUID(), status: "active", startedAt: now, config });
    const invoice = { id: randomUUID(), subscriptionId: account.subscriptions.at(-1)!.id, config, amountCents, status: "pending" as const, createdAt: now };
    account.invoices.push(invoice); event.invoiceId = invoice.id; event.amountCents = amountCents;
    event.before = command.action === "start" ? current?.status ?? "none" : "active"; event.after = "pending";
  } else if (command.action === "cancel") {
    if (current?.status !== "active") throw new Error("Nenhuma assinatura ativa para cancelar.");
    event.before = current.status; current.status = "canceled"; current.canceledAt = now; event.after = current.status;
  } else {
    const invoice = account.invoices.find(i => i.id === command.invoiceId);
    if (!invoice) throw new Error("Cobrança indisponível nesta consultoria.");
    event.invoiceId = invoice.id; event.amountCents = invoice.amountCents; event.before = invoice.status;
    if (command.action === "reconcile") {
      if (!command.referenceStatus || !Object.hasOwn(BILLING_STATUS, command.referenceStatus) || !Number.isSafeInteger(command.referenceAmountCents) || command.referenceAmountCents! < 0 || command.referenceAmountCents! > 100000000) throw new Error("Confira estado e valor em centavos do extrato simulado.");
      event.referenceStatus = command.referenceStatus; event.referenceAmountCents = command.referenceAmountCents;
      event.matched = invoice.status === command.referenceStatus && invoice.amountCents === command.referenceAmountCents;
    } else {
      const transitions: Partial<Record<BillingCommand["action"], { from: InvoiceStatus[]; to: InvoiceStatus }>> = {
        paid: { from: ["pending", "failed"], to: "paid" }, failed: { from: ["pending"], to: "failed" }, retry: { from: ["failed"], to: "pending" }, refund: { from: ["paid"], to: "refunded" }, dispute: { from: ["paid"], to: "disputed" }, dispute_won: { from: ["disputed"], to: "paid" }, dispute_lost: { from: ["disputed"], to: "refunded" },
      };
      const transition = transitions[command.action];
      if (!transition || !transition.from.includes(invoice.status)) throw new Error("Operação incompatível com o estado atual da cobrança. Atualize e confira os valores.");
      invoice.status = transition.to;
    }
    event.after = invoice.status;
  }
  account.events.push(event); account.revision++; db.accounts[tenantId] = account; write(db);
  appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action: "platform.billing_changed", targetId: event.id });
  return { duplicate: false, matched: event.matched };
}
