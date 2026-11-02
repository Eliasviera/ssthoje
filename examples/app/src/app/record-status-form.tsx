"use client";
import { useActionState } from "react";
import { setClientStatusAction } from "./client-actions";
import { setWorkerStatusAction } from "./worker-actions";
export default function RecordStatusForm({ resource, id, active }: { resource: "company" | "worker"; id: string; active: boolean }) {
  const [state, action, pending] = useActionState(resource === "company" ? setClientStatusAction : setWorkerStatusAction, {});
  return <form action={action}><input type="hidden" name={resource === "company" ? "companyId" : "workerId"} value={id}/><input type="hidden" name="status" value={active ? "archived" : "active"}/><button className="text-button" type="submit" disabled={pending}>{pending ? "Registrando…" : `${active ? "Arquivar" : "Reativar"} ${resource === "company" ? "empresa" : "vínculo"}`}</button>{state.error ? <p role="alert" className="form-error">{state.error}</p> : null}</form>;
}
