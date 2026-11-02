"use client";
import { useActionState } from "react";
import { BILLING_ACTIONS, BILLING_STATUS, type BillingAction, type BillingAccount, type Invoice } from "@/lib/billing-types";
import { planTotals, type PlanAccount } from "@/lib/plan-catalog";
import { billingAction, type BillingActionState } from "./billing-actions";
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const stateLabel = (value: string) => ({ ...BILLING_STATUS, active: "Ativa", canceled: "Cancelada", none: "Sem assinatura" } as Record<string, string>)[value] ?? value;
function available(invoice: Invoice): BillingAction[] {
  return ({ pending: ["paid", "failed"], failed: ["retry", "paid"], paid: ["refund", "dispute"], disputed: ["dispute_won", "dispute_lost"], refunded: [] } as Record<string, BillingAction[]>)[invoice.status];
}
function BillingForm({ tenantId, revision, operations, invoice, planRevision, reconciliation = false }: { tenantId: string; revision: number; planRevision?: number; operations: BillingAction[]; invoice?: Invoice; reconciliation?: boolean }) {
  const [state, action, pending] = useActionState<BillingActionState, FormData>(billingAction, {});
  return <form action={action} aria-busy={pending} key={revision}>
    <input type="hidden" name="planRevision" value={planRevision ?? 0}/><input type="hidden" name="tenantId" value={tenantId}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="requestId" value={`${tenantId}:${revision}:${invoice?.id ?? "subscription"}:${reconciliation ? "reconcile" : "event"}`}/>
    {invoice && <input type="hidden" name="invoiceId" value={invoice.id}/>}
    {reconciliation ? <><input type="hidden" name="operation" value="reconcile"/><label>Estado no extrato fictício<select name="referenceStatus" defaultValue={invoice?.status}>{Object.entries(BILLING_STATUS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Valor no extrato fictício (centavos)<input name="referenceAmountCents" type="number" min="0" max="100000000" step="1" required defaultValue={invoice?.amountCents}/></label></> : <label>Operação simulada<select name="operation">{operations.map(op => <option value={op} key={op}>{BILLING_ACTIONS[op]}</option>)}</select></label>}
    <label>Justificativa do evento<textarea name="reason" maxLength={600} required placeholder="Use somente informações fictícias."/></label>
    <label className="platform-check"><input type="checkbox" name="acknowledged" required/>Revisei o evento fictício e seu efeito no histórico comercial.</label>
    <button disabled={pending}>{pending ? "Registrando…" : reconciliation ? "Conferir extrato fictício" : "Registrar evento simulado"}</button>
    {state.error ? <p role="alert" className="platform-error">{state.error}</p> : state.success ? <p role="status">{state.success}</p> : null}
  </form>;
}
export default function BillingPanel({ tenantId, account, planAccount }: { tenantId: string; account: BillingAccount; planAccount: PlanAccount }) {
  const subscription = account.subscriptions.at(-1);
  return <details><summary>Assinatura e cobranças · simulação</summary>
    <p className="platform-warning">Demonstração local. Todos os valores e eventos são fictícios. Nenhum cartão, Pix, boleto, pagamento ou estorno real. A assinatura não altera acessos, limites, módulos ou créditos da consultoria.</p>
    <p><strong>Assinatura: {subscription ? stateLabel(subscription.status) : "Não iniciada"}</strong>{subscription ? ` · Iniciada em ${date(subscription.startedAt)}` : ""}</p>
    <p>Base atual para a próxima cobrança: <strong>{money(planTotals(planAccount.config).price)} · {planAccount.config.cycle === "annual" ? "Anual" : "Mensal"}</strong>. Cada nova cobrança usa a base ilustrativa do plano e ciclo configurados naquele momento. Adicionais sem preço. Não há renovação automática, cálculo proporcional ou vencimento. Cancele para impedir novas cobranças simuladas; as já existentes continuam no histórico e podem receber eventos.</p>
    <details><summary>Gerenciar assinatura simulada</summary><BillingForm tenantId={tenantId} revision={account.revision} planRevision={planAccount.revision} operations={subscription?.status === "active" ? ["issue", "cancel"] : ["start"]}/></details>
    <h3>Cobranças fictícias · {account.invoices.length}</h3>
    {!account.invoices.length ? <p>Nenhuma cobrança simulada registrada.</p> : [...account.invoices].reverse().map((invoice, index) => <section className="billing-invoice" key={invoice.id} aria-label={`Cobrança ${account.invoices.length - index}`}><h4>Cobrança {account.invoices.length - index} · {money(invoice.amountCents)} · {BILLING_STATUS[invoice.status]}</h4><p>{date(invoice.createdAt)} · {invoice.config.plan} · {invoice.config.cycle === "annual" ? "Anual" : "Mensal"}</p>
      {available(invoice).length > 0 && <details><summary>Registrar evento da cobrança {account.invoices.length - index}</summary><BillingForm tenantId={tenantId} revision={account.revision} invoice={invoice} operations={available(invoice)}/></details>}
      <details><summary>Conferir extrato da cobrança {account.invoices.length - index}</summary><p>Compare com um estado e valor fictícios. Divergências são registradas, sem corrigir silenciosamente a cobrança.</p><BillingForm tenantId={tenantId} revision={account.revision} invoice={invoice} operations={["reconcile"]} reconciliation/></details>
    </section>)}
    <details><summary>Histórico comercial · últimos {Math.min(account.events.length, 50)} eventos</summary>{account.events.length ? <ol>{account.events.slice(-50).reverse().map(event => <li key={event.id}><strong>{BILLING_ACTIONS[event.action]}</strong><p>{date(event.occurredAt)} · {stateLabel(event.before)} → {stateLabel(event.after)}{event.amountCents !== undefined ? ` · ${money(event.amountCents)}` : ""}</p>{event.action === "reconcile" && <p>{event.matched ? "Extrato confere" : "Divergência no extrato"} · Referência: {stateLabel(event.referenceStatus ?? "")} · {money(event.referenceAmountCents ?? 0)}</p>}<p>{event.reason}</p></li>)}</ol> : <p>Nenhum evento registrado.</p>}</details>
    {account.subscriptions.length > 1 && <details><summary>Assinaturas anteriores · {account.subscriptions.length - 1}</summary><ol>{account.subscriptions.slice(0, -1).map(old => <li key={old.id}>Início: {date(old.startedAt)} · {stateLabel(old.status)}{old.canceledAt ? ` · Cancelamento: ${date(old.canceledAt)}` : ""}</li>)}</ol></details>}
  </details>;
}
