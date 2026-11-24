import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import TrainingAssessmentDemo from "./panel";
import IntegrationModule from "./integration-module";
import PanelShell from "../panel-shell";

const demoViewers = new Set(["sst-demo-trabalhador", "sst-demo-campo", "sst-demo-sst", "sst-demo-user"]);

export default function TrainingDemoPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo avaliação de demonstração…</main>}><TrainingDemoContent /></Suspense>;
}

async function TrainingDemoContent() {
  await connection();
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !demoViewers.has(access.session.userId)) redirect("/sem-acesso");

  return <PanelShell tenantName={access.context.tenant.name} current="/treinamentos-demo">
    <div className="content-wrap">
      <section className="welcome-row"><div><p className="eyebrow">ENSAIO FICTÍCIO</p><h1>Treinamentos demonstrativos</h1><p className="page-description">Piloto de integração pelo app e ensaio de avaliação nas duas modalidades. Simulações sem valor de capacitação.</p></div></section>
      <IntegrationModule />
      <TrainingAssessmentDemo participantLabel={access.context.membership.displayName}/>
    </div>
  </PanelShell>;
}
