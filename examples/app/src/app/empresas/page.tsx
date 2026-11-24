import { Suspense } from "react";

import { connection } from "next/server";
import { redirect } from "next/navigation";
import ClientSection from "../client-section";
import { listClientCompanies } from "@/lib/client-service";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";

import PanelShell from "../panel-shell";

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

    return <PanelShell
    tenantName={tenant.name}
    current="/empresas"
    title="Empresas"
    showNrs={hasTenantPermission(membership.role, "aso.status.read")}
    showAccidents={hasTenantPermission(membership.role, "accident.report")}
  >
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div><p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p><h1 id="page-title">Painel de clientes</h1><p className="page-description">Acesse cada cliente para consultar seu PGR e analisar a documentação das empresas terceiras contratadas por ele.</p></div>
      </section>
      <ClientSection companies={companies} canManage={canManage} />
    </div>
  </PanelShell>;
}
