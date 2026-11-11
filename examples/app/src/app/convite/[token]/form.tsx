"use client";
import { useActionState } from "react";
import { activateTrialAction } from "./actions";
export default function TrialForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(activateTrialAction.bind(null, token), { error: "" });
  return <form action={action} className="login-form" aria-busy={pending}>
    <label htmlFor="name">Nome de demonstração</label><input id="name" name="displayName" required maxLength={120} autoComplete="off"/>
    <label htmlFor="email">E-mail de acesso</label><input id="email" type="email" name="email" required maxLength={254} autoComplete="username"/>
    <label htmlFor="password">Senha (12 a 128 caracteres)</label><input id="password" type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password"/>
    <label><input type="checkbox" name="acknowledged" required/>Usarei apenas dados fictícios nos cadastros e documentos deste ambiente.</label>
    {state.error && <p role="alert">{state.error}</p>}<button disabled={pending}>{pending ? "Ativando…" : "Ativar meus 30 dias de teste"}</button>
  </form>;
}
