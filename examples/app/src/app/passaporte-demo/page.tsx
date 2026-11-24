import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import PassaporteDemoPanel from "./panel";
import PanelShell from "../panel-shell";

const demoViewers = new Set(["sst-demo-trabalhador", "sst-demo-campo", "sst-demo-sst", "sst-demo-user"]);

export default function PassaporteDemoPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo passaporte de demonstração…</main>}><PassaporteDemoContent /></Suspense>;
}

async function PassaporteDemoContent() {
  await connection();
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !demoViewers.has(access.session.userId)) redirect("/sem-acesso");

  return <PanelShell tenantName={access.context.tenant.name} current="/passaporte-demo">
    <div className="content-wrap">
      <section className="welcome-row"><div><p className="eyebrow">PROTÓTIPO NAVEGÁVEL · DADOS 100% FICTÍCIOS</p><h1>Passaporte Digital de SST</h1><p className="page-description">Experimente a carteira do colaborador e o ensaio de consulta em campo.</p></div></section>
      <PassaporteDemoPanel />
    </div>
  </PanelShell>;
}
