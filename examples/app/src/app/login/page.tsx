import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { resolveTenantMembership } from "@/lib/tenant-access";
import { isPlatformMaster } from "@/lib/platform-identity";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-loading">Preparando acesso…</main>}><LoginPageContent /></Suspense>;
}

async function LoginPageContent() {
  await connection();
  const session = await getSession();
  if (session) {
    if (isPlatformMaster(session.userId)) redirect("/master");
    if (resolveTenantMembership(session.userId)) redirect("/");
    redirect("/sem-acesso");
  }

  return <main className="login-shell">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><Image src="/logo-sst-hoje.png" alt="" width={58} height={58} priority/><span>SST <strong>Hoje</strong><small>Não deixa para amanhã.</small></span></div>
      <div className="login-intro"><p className="eyebrow">ACESSO AO SST HOJE</p><h1 id="login-title">Acesse sua conta</h1><p>Entre para acompanhar a rotina de Saúde e Segurança do Trabalho.</p></div>
      <LoginForm />
      <div className="login-help"><span aria-hidden="true">i</span><p>Esta versão usa uma conta fictícia de demonstração. A recuperação de acesso ainda será planejada.</p></div>
      <footer className="login-footer"><span>Ambiente local de demonstração</span><span>Seus dados não saem deste computador.</span></footer>
    </section>
  </main>;
}
