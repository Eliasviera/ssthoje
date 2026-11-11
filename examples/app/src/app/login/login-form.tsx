"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

const initialState: LoginState = { error: "" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return <form action={action} className="login-form" aria-busy={pending}>
    <label htmlFor="email">E-mail</label>
    <input id="email" name="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" required maxLength={254}/>
    <div className="password-label"><label htmlFor="password">Senha</label></div>
    <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Digite sua senha" required maxLength={256}/>
    {state.error ? <p className="login-error" role="alert">{state.error}</p> : null}
    <button className="login-submit" type="submit" disabled={pending}>{pending ? "Entrando…" : "Entrar"}<span aria-hidden="true">→</span></button>
    <p className="login-demo-label">Se ativou um convite, use o e-mail e a senha escolhidos no cadastro.</p>
  </form>;
}
