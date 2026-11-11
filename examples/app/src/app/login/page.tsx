import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { resolveTenantMembership } from "@/lib/tenant-access";
import { isPlatformMaster } from "@/lib/platform-identity";
import LoginForm from "./login-form";

type LoginPageProps = { searchParams: Promise<{ convite?: string | string[] }> };

export default function LoginPage(props: LoginPageProps) {
  return <Suspense fallback={<main className="auth-loading">Preparando acesso…</main>}><LoginPageContent {...props}/></Suspense>;
}

async function LoginPageContent({ searchParams }: LoginPageProps) {
  await connection();
  const session = await getSession();
  if (session) {
    if (isPlatformMaster(session.userId)) redirect("/master");
    if (resolveTenantMembership(session.userId)) redirect("/");
    redirect("/sem-acesso");
  }

  const activated = (await searchParams).convite === "ativado";
  return <main className="login-shell">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><Image src="/logo-sst-hoje.png" alt="" width={58} height={58} priority/><span>SST <strong>Hoje</strong><small>Não deixa para amanhã.</small></span></div>
      <div className="login-intro"><p className="eyebrow">ACESSO AO SST HOJE</p><h1 id="login-title">Acesse sua conta</h1><p>Entre para acompanhar a rotina de Saúde e Segurança do Trabalho.</p></div>
      {activated && <p role="status">Cadastro concluído. Entre com o e-mail e a senha que você acabou de criar. Seu prazo de teste começou na ativação.</p>}
      <LoginForm />
      <div className="login-help"><span aria-hidden="true">i</span><p>Acesse com sua conta de teste ou de demonstração. A recuperação de acesso ainda será planejada.</p></div>
      <footer className="login-footer"><span>Ambiente local de demonstração</span><span>Seus dados não saem deste computador.</span></footer>
    </section>
  </main>;
}
