import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listRiskAnalyses } from "@/lib/risk-analysis-store";
import { listActiveAprModels, listAprModels } from "@/lib/apr-catalog";
import { loadVocabulary } from "@/lib/field-vocabulary";
import { listWorkersForTenant } from "@/lib/worker-store";
import { logoutAction } from "../actions";
import RiskAnalysisSection from "../risk-analysis-section";

export const metadata = { title: "AR · Análise de Risco — SST Hoje" };

export default function RiskAnalysisPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo análises de risco…</main>}><RiskAnalysisContent /></Suspense>;
}

async function RiskAnalysisContent() {
  await connection();
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { tenant, membership } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const records = listRiskAnalyses(tenant.id);
  const workers = listWorkersForTenant(tenant.id).filter((worker) => worker.status === "active")
    .map((worker) => ({ id: worker.id, name: worker.displayName, jobTitle: worker.jobTitle, companyId: worker.companyId, unitId: worker.unitId }));
  const canManage = hasTenantPermission(membership.role, "safety.risk_analysis.manage");

  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>AR · Análise de Risco</strong></div>
      <Link className="secondary-button" href="/empresas">Voltar ao painel</Link>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p>
          <h1 id="page-title">AR · Análise de Risco</h1>
          <p className="page-description">
            A AR é um documento independente do Programa de Gerenciamento de Riscos (PGR).
            A Análise Preliminar de Risco (APR) usa os riscos do inventário do PGR aprovado.
          </p>
        </div>
      </section>

      {!canManage && <section className="panel" aria-labelledby="risk-analysis-access">
        <h2 id="risk-analysis-access">Quer criar uma AR?</h2>
        <p>Entre com uma conta de perfil Profissional SST para criar, revisar ou emitir uma análise.</p>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">Sair para trocar de conta</button>
        </form>
      </section>}
      <RiskAnalysisSection records={records} companies={companies} canManage={canManage} catalogModels={listAprModels()} vocabulary={loadVocabulary().entries} workers={workers} />
    </div>
  </main>;
}
