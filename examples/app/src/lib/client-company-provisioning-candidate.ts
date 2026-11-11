import "server-only";
import { randomUUID } from "node:crypto";
import type { ClientCompanyBinding } from "./client-company-scope.ts";

// Contrato candidato, sem adapter ativo nem chamadores em rotas/actions.
// O adapter deve bloquear/revalidar autoridade, identidade e vínculo na mesma
// transação e serializar operações concorrentes por tenant+usuário.
export type ProvisioningIdentity = { userId: string; verified: boolean; platformMaster: boolean };
export type ProvisioningEvent = {
  id: string; action: "client_company.granted" | "client_company.revoked";
  tenantId: string; actorUserId: string; subjectUserId: string;
  bindingId: string; revision: number; occurredAt: string; reviewReference: string;
  binding: ClientCompanyBinding;
};
export interface ClientProvisioningTransaction {
  canProvision(actorUserId: string, tenantId: string, companyId: string): Promise<boolean>;
  getVerifiedIdentity(userId: string): Promise<ProvisioningIdentity | null>;
  getMembership(tenantId: string, userId: string): Promise<{ role: string; status: string } | null>;
  getCompany(tenantId: string, companyId: string): Promise<{ status: string; unitIds: string[] } | null>;
  getBinding(tenantId: string, userId: string): Promise<ClientCompanyBinding | null>;
  saveClientMembership(tenantId: string, userId: string): Promise<void>;
  saveBinding(binding: ClientCompanyBinding): Promise<void>;
  appendEvent(event: ProvisioningEvent): Promise<void>;
}
export interface ClientProvisioningAdapter {
  // Identidade derivada da sessão verificada no servidor, nunca do formulário.
  authenticatedActor(): Promise<{ userId: string; tenantId: string } | null>;
  transaction<T>(run: (tx: ClientProvisioningTransaction) => Promise<T>): Promise<T>;
}
export class ClientProvisioningError extends Error {}
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,140}$/.test(value);
function deny(): never { throw new ClientProvisioningError("Acesso indisponível. Confira sua autorização com o responsável."); }

export async function provisionClientCompanyCandidate(adapter: ClientProvisioningAdapter, input: {
  operation: "grant" | "revoke"; userId: string; companyId: string; unitIds: string[];
  validUntil: string; expectedRevision: number; reviewReference: string;
}) {
  const actor = await adapter.authenticatedActor();
  if (!actor || !id(actor.userId) || !id(actor.tenantId)) deny();
  if (!input || !["grant", "revoke"].includes(input.operation) || !id(input.userId) || !id(input.companyId)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || typeof input.reviewReference !== "string" || !input.reviewReference.trim() || input.reviewReference.length > 200) {
    throw new ClientProvisioningError("Confira identidade, empresa, revisão e referência da revisão humana.");
  }
  // Copia os valores antes de aguardar o adapter: o formulário não controla
  // objetos usados posteriormente pela transação.
  const command = { ...input, unitIds: Array.isArray(input.unitIds) ? [...input.unitIds] : [], reviewReference: input.reviewReference.trim() };
  return adapter.transaction(async (tx) => {
    if (!await tx.canProvision(actor.userId, actor.tenantId, command.companyId)) deny();
    const previous = await tx.getBinding(actor.tenantId, command.userId);
    if ((previous?.revision ?? 0) !== command.expectedRevision) throw new ClientProvisioningError("O vínculo mudou. Atualize a tela e revise novamente.");
    if (previous && (previous.tenantId !== actor.tenantId || previous.userId !== command.userId || previous.companyId !== command.companyId)) deny();
    const now = new Date();
    let next: ClientCompanyBinding;
    if (command.operation === "revoke") {
      if (!previous || previous.status !== "active") deny();
      next = { ...previous, unitIds: [...previous.unitIds], status: "revoked", revision: previous.revision + 1,
        reviewedByUserId: actor.userId, reviewReference: command.reviewReference };
    } else {
      const identity = await tx.getVerifiedIdentity(command.userId);
      if (!identity || identity.userId !== command.userId || !identity.verified || identity.platformMaster || command.userId === actor.userId) deny();
      const membership = await tx.getMembership(actor.tenantId, command.userId);
      // Não converte papéis existentes nem reativa membership suspensa.
      if (membership && (membership.role !== "cliente" || membership.status !== "active")) deny();
      const company = await tx.getCompany(actor.tenantId, command.companyId);
      if (!company || company.status !== "active" || command.unitIds.length < 1 || command.unitIds.length > 100
        || !command.unitIds.every((unit) => id(unit) && company.unitIds.includes(unit))
        || new Set(command.unitIds).size !== command.unitIds.length) deny();
      if (typeof command.validUntil !== "string" || !Number.isFinite(Date.parse(command.validUntil)) || Date.parse(command.validUntil) <= now.getTime()) {
        throw new ClientProvisioningError("Informe um vencimento futuro válido.");
      }
      next = { id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1,
        userId: command.userId, tenantId: actor.tenantId, companyId: command.companyId,
        unitIds: [...command.unitIds], status: "active", validFrom: now.toISOString(), validUntil: new Date(command.validUntil).toISOString(),
        reviewedByUserId: actor.userId, reviewReference: command.reviewReference };
      await tx.saveClientMembership(actor.tenantId, command.userId);
    }
    await tx.saveBinding(next);
    await tx.appendEvent({ id: randomUUID(), action: command.operation === "grant" ? "client_company.granted" : "client_company.revoked",
      tenantId: actor.tenantId, actorUserId: actor.userId, subjectUserId: command.userId,
      bindingId: next.id, revision: next.revision, occurredAt: now.toISOString(), reviewReference: command.reviewReference,
      binding: { ...next, unitIds: [...next.unitIds] } });
    return { bindingId: next.id, revision: next.revision, status: next.status };
  });
}
