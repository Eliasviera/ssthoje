"use client";

import { useActionState } from "react";
import { scheduleIntegrationAction, type IntegrationFormState } from "./actions";

function Message({ state }: { state: IntegrationFormState }) {
  return <>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</>;
}
export function ScheduleForm({ invitationId, approvalId, today }: { invitationId: string; approvalId: string; today: string }) {
  const [state, action, pending] = useActionState(async (_previous: IntegrationFormState, data: FormData) => scheduleIntegrationAction(data), {});
  return <form action={action} className="pgr-form"><input type="hidden" name="invitationId" value={invitationId}/><input type="hidden" name="approvalId" value={approvalId}/><label className="form-field">Data da integração · Brasília<input type="date" name="scheduledOn" min={today} required/></label><button className="primary-button" disabled={pending}>{pending ? "Agendando…" : "Registrar agendamento local"}</button><Message state={state}/></form>;
}

