"use client";

import { useActionState } from "react";
import type { ClientRegistrarInvitationProposal } from "@/lib/third-party-legacy-invitation-read-service";
import { confirmLegacyInvitationCaseAction, type M22FormState } from "./third-party-legacy-invitation-actions";

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function ConfirmationForm({ proposal }: { proposal: ClientRegistrarInvitationProposal }) {
  const [state, action, pending] = useActionState(
    async (_previous: M22FormState, data: FormData) => confirmLegacyInvitationCaseAction(data),
    {},
  );

  return <article className="pgr-card">
    <h3>Convite {proposal.invitationId}</h3>
    <p>Empresa {proposal.companyId} · unidade {proposal.unitId} · caso {proposal.workflowId}</p>
    <p>Proposta da consultoria: {proposal.rationale}</p>
    <p>Registrada em {date(proposal.occurredAt)} · revisão {proposal.revision}</p>
    <form action={action} className="pgr-form">
      <input type="hidden" name="invitationId" value={proposal.invitationId}/>
      <input type="hidden" name="contextSha256" value={proposal.contextSha256}/>
      <input type="hidden" name="revision" value={proposal.revision}/>
      <input type="hidden" name="snapshotId" value={proposal.snapshotId}/>
      <input type="hidden" name="companyId" value={proposal.companyId}/>
      <input type="hidden" name="unitId" value={proposal.unitId}/>
      <input type="hidden" name="thirdPartyId" value={proposal.thirdPartyId}/>
      <input type="hidden" name="workflowId" value={proposal.workflowId}/>
      <div className="form-field pgr-wide">
        <label htmlFor={`client-confirmation-${proposal.eventId}`}>Justificativa da confirmação</label>
        <textarea id={`client-confirmation-${proposal.eventId}`} name="rationale" required maxLength={1600}/>
      </div>
      {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
      {state.success && <p className="client-form-message" role="status">{state.success}</p>}
      <div className="pgr-form-footer"><p>Confirme somente se reconhece este convite e este caso no escopo da sua designação.</p><button className="primary-button" type="submit" disabled={pending}>{pending ? "Confirmando…" : "Confirmar vínculo"}</button></div>
    </form>
  </article>;
}

export default function ClientCaseConfirmationsSection({
  proposals,
}: {
  proposals: ClientRegistrarInvitationProposal[];
}) {
  return <section className="panel pgr-section" aria-labelledby="m22-confirmations-title">
    <div className="panel-heading"><div><h2 id="m22-confirmations-title">Confirmações de vínculos</h2><p>Propostas visíveis apenas para representante cliente designado e válido na empresa e unidade correspondentes.</p></div><span className="period-label">Revisão humana</span></div>
    <div className="document-warning"><strong>Confirmar o vínculo não aprova documentos nem comprova conformidade.</strong> A confirmação registra somente que a proposta aponta para o caso correto; divergências devem permanecer sem confirmação.</div>
    {proposals.length
      ? <div className="pgr-records">{proposals.map((proposal) => <ConfirmationForm key={proposal.eventId} proposal={proposal}/>)}</div>
      : <p className="permission-note">Nenhuma proposta está disponível nos escopos de representante atualmente designados a esta conta. Ter uma membership cliente ou informar um nome não concede essa designação.</p>}
  </section>;
}
