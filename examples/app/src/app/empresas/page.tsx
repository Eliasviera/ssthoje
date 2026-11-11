import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import ClientSection from "../client-section";
import { listClientCompanies } from "@/lib/client-service";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";

export default function CompaniesPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo empresas…</main>}><CompaniesContent /></Suspense>;
}

async function CompaniesContent() {
  await connection();
  const access = await getCurrentTenantAccess("tenant.clients.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { membership, tenant } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const canManage = hasTenantPermission(membership.role, "tenant.clients.manage");

  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>Empresas</strong></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="secondary-button" href="/analise-risco">AR · Análise de risco</Link>
        <Link className="secondary-button" href="/apr">APR e checklists</Link>
        <Link className="secondary-button" href="/cipa">CIPA</Link>
        <Link className="secondary-button" href="/checklists">Checklists</Link>
        <Link className="secondary-button" href="/equipamentos">Equipamentos</Link>
        <Link className="secondary-button" href="/dds">DDS</Link>
        <Link className="secondary-button" href="/desvios">Desvios</Link>
        <Link className="secondary-button" href="/relatorios/desvios">Relatório de desvios</Link>
        <Link className="secondary-button" href="/permissoes-trabalho">PT e PTE</Link>
        <Link className="secondary-button" href="/empresas">Voltar às empresas</Link>
      </div>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div><p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p><h1 id="page-title">Painel de clientes</h1><p className="page-description">Acesse cada cliente para consultar seu PGR e analisar a documentação das empresas terceiras contratadas por ele.</p></div>
      </section>
      <ClientSection companies={companies} canManage={canManage} />
    </div>
  </main>;
}
