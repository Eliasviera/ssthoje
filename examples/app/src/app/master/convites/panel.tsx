"use client";
import { useActionState, useSyncExternalStore } from "react";
import { manageInviteAction } from "./actions";
import type { getTrialAdministration } from "@/lib/trial-invite-service";
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const serverOrigin = () => "";
function Operation({ operation, value, label }: { operation: string; value: string; label: string }) {
  const [state, action, pending] = useActionState(manageInviteAction, {});
  return <form action={action}><input type="hidden" name="operation" value={operation}/><input type="hidden" name="value" value={value}/><button disabled={pending}>{label}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
export default function InvitePanel({ data }: { data: ReturnType<typeof getTrialAdministration> }) {
  const [state, action, pending] = useActionState(manageInviteAction, {});
  const origin = useSyncExternalStore(subscribe, getOrigin, serverOrigin);
  const statuses = { pending: "Pendente", used: "Usado", revoked: "Revogado", expired: "Expirado" };
  return <>
    <p>Convite válido por 7 dias e de uso único. A ativação cria um ambiente vazio por 30 dias. Use somente dados fictícios. A prorrogação de mais 30 dias depende do Master e só pode ocorrer uma vez.</p>
    <form action={action} className="login-form"><input type="hidden" name="operation" value="create"/><label htmlFor="invite-label">Referência fictícia do convite</label><input id="invite-label" name="value" required maxLength={120}/><button disabled={pending}>Gerar convite</button></form>
    {state.error && <p role="alert">{state.error}</p>}
    {state.path && <div role="status"><p>Copie o link agora. Ele não poderá ser recuperado após sair desta tela.</p><input aria-label="Link do convite" readOnly value={`${origin}${state.path}`} onFocus={(event) => event.target.select()} style={{ width: "100%" }}/></div>}
    <h2>Convites</h2>{!data.invites.length && <p>Nenhum convite criado.</p>}
    {data.invites.map((invite) => <article key={invite.id}><h3>{invite.label}</h3><p>{statuses[invite.status]} · validade até {date(invite.expiresAt)} (Brasília)</p>{invite.status === "pending" && <Operation operation="revoke" value={invite.id} label="Revogar convite"/>}</article>)}
    <h2>Contas de teste</h2>{!data.accounts.length && <p>Nenhuma conta ativada.</p>}
    {data.accounts.map((account) => <article key={account.userId}><h3>{account.tenantName}</h3><p>Acesso até {date(account.expiresAt)} (Brasília). Prorrogações: {account.extensionsUsed}/1.</p>{account.extensionsUsed === 0 && <Operation operation="extend" value={account.userId} label="Autorizar mais 30 dias"/>}</article>)}
    <p>O vencimento bloqueia o acesso. O expurgo automático dos dados ainda não está implementado.</p>
  </>;
}
