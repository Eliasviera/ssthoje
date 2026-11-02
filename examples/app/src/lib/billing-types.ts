import type { PlanConfig } from "./plan-catalog.ts";
export const BILLING_STATUS = { pending: "Pendente", paid: "Paga", failed: "Falha", refunded: "Estornada", disputed: "Em disputa" } as const;
export type InvoiceStatus = keyof typeof BILLING_STATUS;
export const BILLING_ACTIONS = { start: "Iniciar assinatura simulada", issue: "Gerar próxima cobrança simulada", cancel: "Cancelar assinatura simulada", paid: "Simular pagamento", failed: "Simular falha", retry: "Reabrir cobrança com falha", refund: "Simular estorno integral", dispute: "Simular abertura de disputa", dispute_won: "Simular disputa favorável", dispute_lost: "Simular disputa perdida", reconcile: "Conferir extrato simulado" } as const;
export type BillingAction = keyof typeof BILLING_ACTIONS;
export type Subscription = { id: string; status: "active" | "canceled"; startedAt: string; canceledAt?: string; config: PlanConfig };
export type Invoice = { id: string; subscriptionId: string; amountCents: number; config: PlanConfig; status: InvoiceStatus; createdAt: string };
export type BillingEvent = { id: string; requestId: string; commandHash: string; action: BillingAction; invoiceId?: string; actorUserId: string; occurredAt: string; reason: string; before: string; after: string; amountCents?: number; referenceStatus?: InvoiceStatus; referenceAmountCents?: number; matched?: boolean };
export type BillingAccount = { revision: number; subscriptions: Subscription[]; invoices: Invoice[]; events: BillingEvent[] };
export type BillingCommand = { action: BillingAction; requestId: string; expectedRevision: number; reason: string; invoiceId?: string; referenceStatus?: InvoiceStatus; referenceAmountCents?: number; expectedPlanRevision?: number };
export function emptyBillingAccount(): BillingAccount { return { revision: 0, subscriptions: [], invoices: [], events: [] }; }
