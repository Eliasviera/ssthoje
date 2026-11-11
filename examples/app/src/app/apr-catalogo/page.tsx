import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listAprModels, summarizeAprModel } from "@/lib/apr-catalog";
import AprCatalogPanel from "./apr-catalog-panel";

export const metadata = { title: "Acervo de APR — SST Hoje" };

export default function AprCatalogPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo acervo de APR…</main>}><Content/></Suspense>;
}

async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant, membership } = access.context;
  const models = listAprModels().map((model) => ({ model, summary: summarizeAprModel(model) }));
  const canManage = hasTenantPermission(membership.role, "safety.risk_analysis.manage");
  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>Acervo de APR</strong></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="secondary-button" href="/apr">APR</Link>
        <Link className="secondary-button" href="/analise-risco">AR</Link>
        <Link className="secondary-button" href="/">Voltar ao painel</Link>
      </div>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p>
          <h1 id="page-title">Acervo de APR</h1>
          <p className="page-description">Biblioteca de modelos por etapa operacional. Cada perigo pode ser marcado como aplicável, não aplicável (com justificativa) ou a confirmar.</p>
        </div>
      </section>
      <AprCatalogPanel models={models} canManage={canManage}/>
    </div>
  </main>;
}
