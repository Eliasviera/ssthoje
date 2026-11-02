import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import WorkersPageSection from "../workers-page-section";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";

export default function WorkersPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo trabalhadores…</main>}><WorkersContent /></Suspense>;
}

async function WorkersContent() {
  await connection();
  const access = await getCurrentTenantAccess("workers.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { membership, tenant } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const workers = listWorkersForTenant(tenant.id);
  const canManage = hasTenantPermission(membership.role, "workers.manage");

  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>Trabalhadores</strong></div>
      <Link className="secondary-button" href="/">Voltar ao painel</Link>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div><p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p><h1 id="page-title">Trabalhadores</h1><p className="page-description">Vínculos, funções e categorias de risco cadastrados nesta consultoria.</p></div>
      </section>
      <WorkersPageSection workers={workers} companies={companies} canManage={canManage} />
    </div>
  </main>;
}
