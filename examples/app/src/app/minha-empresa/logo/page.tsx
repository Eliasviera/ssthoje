import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import { listClientCompanies } from "@/lib/client-service";
import { readClientLogo } from "@/lib/client-logo";
import ClientLogoForm from "@/app/client-logo-form";
import PanelShell from "../../panel-shell";

export default function CompanyLogoPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo logo da empresa…</main>}><CompanyLogo /></Suspense>;
}

async function CompanyLogo() {
  await connection();
  const access = await getCurrentTenantAccess("client.logo.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { tenant } = access.context;
  const company = scopeClientCompanies(access.context, await listClientCompanies(tenant.id)).find(entry => entry.status === "active");
  if (!company) redirect("/sem-acesso");
  const logo = await readClientLogo(tenant.id, company.id);

  return <PanelShell tenantName={tenant.name} current="/minha-empresa/logo">
    <div className="content-wrap">
      <section className="panel company-detail-panel">
        <h1>Logo da empresa</h1>
        <p>{company.tradeName || company.legalName}</p>
        <ClientLogoForm hasLogo={Boolean(logo)} />
      </section>
    </div>
  </PanelShell>;
}
