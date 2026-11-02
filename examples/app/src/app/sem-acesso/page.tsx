import { logoutAction } from "../actions";

export default function AccessDeniedPage() {
  return <main className="login-shell"><section className="login-card access-denied" aria-labelledby="denied-title">
    <span className="access-denied-icon" aria-hidden="true">!</span>
    <div className="login-intro"><p className="eyebrow">ACESSO RESTRITO</p><h1 id="denied-title">Você não tem acesso a esta área.</h1><p>Seu perfil não está vinculado a uma consultoria com permissão para abrir este painel.</p></div>
    <form action={logoutAction}><button className="login-submit" type="submit">Sair da conta</button></form>
  </section></main>;
}
