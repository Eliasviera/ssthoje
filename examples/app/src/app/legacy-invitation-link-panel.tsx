"use client";

import { useActionState } from "react";
import type {
  LegacyInvitationCaseLinkState,
  LegacyInvitationCaseOption,
} from "@/lib/third-party-legacy-invitation-read-service";
import type { InvitationSummary } from "@/lib/third-party-store";
import {
  previewLegacyInvitationAction,
  proposeLegacyInvitationCaseAction,
  type M22FormState,
} from "./third-party-legacy-invitation-actions";

const statusLabels: Record<LegacyInvitationCaseLinkState["eventType"], string> = {
  pending: "Contexto capturado · aguardando revisão",
  proposed: "Proposta enviada · aguardando confirmação cliente",
  linked: "Proposta confirmada pelo cliente",
  ambiguous: "Vínculo marcado para revisão",
  rejected: "Proposta rejeitada · novo vínculo bloqueado",
  unavailable: "Origem indisponível · revisão necessária",
  reopened: "Vínculo reaberto · revisão necessária",
};

const statesThatCanBeProposed = new Set<LegacyInvitationCaseLinkState["eventType"]>([
  "pending",
  "ambiguous",
  "unavailable",
  "reopened",
]);

export default function LegacyInvitationLinkPanel({
  invitation,
  cases,
  state,
  canReview,
  reviewLoading = false,
}: {
  invitation: InvitationSummary;
  cases: LegacyInvitationCaseOption[];
  state?: LegacyInvitationCaseLinkState;
  canReview: boolean;
  reviewLoading?: boolean;
}) {
  const [previewState, previewAction, previewPending] = useActionState(
    async (_previous: M22FormState, data: FormData) => previewLegacyInvitationAction(data),
    {},
  );
  const [proposalState, proposalAction, proposalPending] = useActionState(
    async (_previous: M22FormState, data: FormData) => proposeLegacyInvitationCaseAction(data),
    {},
  );
  const canPropose = canReview && (!state || statesThatCanBeProposed.has(state.eventType));

  return <details className="thirdparty-gate">
    <summary>Vínculo do convite com caso operacional · {state ? statusLabels[state.eventType] : "Ainda não revisado"}</summary>
    <div className="permission-note">
      {state && <p><strong>{statusLabels[state.eventType]}</strong> · revisão {state.revision}. {state.rationale}</p>}
      {state?.eventType === "proposed" && <p>Alvo proposto: empresa {state.companyId} · unidade {state.unitId} · caso {state.workflowId}. A confirmação depende de representante cliente designado nesse escopo.</p>}
      {state?.eventType === "linked" && <p>Alvo confirmado: empresa {state.companyId} · unidade {state.unitId} · caso {state.workflowId}.</p>}

      {canPropose && reviewLoading && <p role="status">Carregando casos e estado do convite…</p>}
      {canPropose && !reviewLoading && <>
        {cases.length === 0
          ? <p>Nenhum caso operacional existente está disponível neste tenant. Crie ou regularize o caso antes de propor; não use IDs inventados.</p>
          : <>
            <form action={previewAction}>
              <input type="hidden" name="invitationId" value={invitation.id}/>
              <button className="secondary-button" type="submit" disabled={previewPending}>{previewPending ? "Lendo contexto…" : "Revisar contexto atual do convite"}</button>
            </form>
            {previewState.error && <p className="client-form-message client-form-error" role="alert">{previewState.error}</p>}
            {previewState.preview && <div className="thirdparty-invitation-content">
              <p>Contexto relido da origem atual. Digest: <code>{previewState.preview.contextSha256.slice(0, 16)}…</code></p>
              <p>Empresa de origem: {previewState.preview.sourceCompanyId ?? "não informada"} · unidade: {previewState.preview.sourceUnitId ?? "não informada"}</p>
              <p>CNPJ declarado: {previewState.preview.contractorCnpj ?? "não informado"} · escopo: {previewState.preview.scopeText ?? "não informado"}</p>
              <p>Documentos solicitados: {previewState.preview.requestedCategories.join(" · ")}</p>
              <form action={proposalAction} className="pgr-form">
                <input type="hidden" name="invitationId" value={invitation.id}/>
                <input type="hidden" name="contextSha256" value={previewState.preview.contextSha256}/>
                <div className="form-field pgr-wide">
                  <label htmlFor={`m22-case-${invitation.id}`}>Caso operacional existente</label>
                  <select id={`m22-case-${invitation.id}`} name="caseId" required defaultValue="">
                    <option value="" disabled>Selecione o caso revisado</option>
                    {cases.map((item) => <option key={item.caseId} value={item.caseId}>{item.workScope} · empresa {item.companyId} · unidade {item.unitId} · {item.caseId.slice(0, 8)}</option>)}
                  </select>
                </div>
                <div className="form-field pgr-wide">
                  <label htmlFor={`m22-rationale-${invitation.id}`}>Justificativa da proposta</label>
                  <textarea id={`m22-rationale-${invitation.id}`} name="rationale" required maxLength={1600}/>
                </div>
                {proposalState.error && <p className="client-form-message client-form-error" role="alert">{proposalState.error}</p>}
                {proposalState.success && <p className="client-form-message" role="status">{proposalState.success}</p>}
                <div className="pgr-form-footer"><p>A proposta não confirma o vínculo, não aprova documentos e será revalidada contra a origem antes de gravar.</p><button className="primary-button" type="submit" disabled={proposalPending}>{proposalPending ? "Registrando proposta…" : "Enviar proposta ao cliente"}</button></div>
              </form>
            </div>}
          </>}
      </>}
      {!canReview && <p>A proposta é preparada pela consultoria; sua conta só pode confirmar quando houver designação vigente para o escopo.</p>}
    </div>
  </details>;
}
