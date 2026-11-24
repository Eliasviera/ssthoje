import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { DEFAULT_PLAN, PLANS } from "@/lib/plan-catalog";
import { readPlatformState } from "@/lib/tenant-state";
import TopbarActions from "../field-nav";
import TrainingTabs from "./training-tabs";
import PanelShell from "../panel-shell";

export default function TrainingAccessPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo treinamentos…</main>}><Content/></Suspense>;
}

async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("dds.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !["cliente", "consultoria_admin", "sst_tst"].includes(access.context.membership.role)) redirect("/sem-acesso");

  const { tenant, membership } = access.context;
  const planAccount = readPlatformState().plans?.[tenant.id] ?? DEFAULT_PLAN;
  const plan = PLANS[planAccount.config.plan] ?? PLANS.essencial;
  const included = plan.includesTraining;
  const additionalEnabled = planAccount.config.trainingAddonActive === true;
  const status = included ? "Incluído no plano" : additionalEnabled ? "Adicional contratado" : "Disponível para contratação";

  return <PanelShell tenantName={tenant.name} current="/treinamentos">
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title"><div><p className="eyebrow">CAPACITAÇÃO · MÓDULO OPCIONAL</p><h1 id="page-title">Treinamentos</h1><p className="page-description">Capacitações presenciais e pelo app, com avaliações e registros reunidos no SST Hoje.</p></div></section>
      <TrainingTabs planName={plan.name} status={status} included={included} additionalEnabled={additionalEnabled}/>
      <div className="client-card-actions"><Link className="text-button" href="/dds">Voltar ao painel</Link></div>
    </div>
  </PanelShell>;
}
