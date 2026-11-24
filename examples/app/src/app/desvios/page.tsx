import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listDeviationsForAccess } from "@/lib/company-scoped-reads";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import DeviationSection from "./section";


import PanelShell from "../panel-shell";

export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo desvios…</main>}><Content/></Suspense>;
}
async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant, membership } = access.context;
  const canManage = (await getCurrentTenantAccess("deviation.manage")).context !== null;
  const canPickScope = membership.role === "cliente" || canManage || (await getCurrentTenantAccess("checklist.apply")).context !== null;
  const companies = canPickScope ? scopeClientCompanies(access.context, await listClientCompanies(tenant.id)) : [];
  const records = listDeviationsForAccess(access.context, { userId: access.session.userId, canManage });
  const nameOf = (companyId: string, unitId: string) => {
    const company = companies.find((item) => item.id === companyId);
    const unit = company?.units.find((item) => item.id === unitId);
    return company ? `${company.tradeName || company.legalName}${unit ? ` · ${unit.name}` : ""}` : "";
  };
  const items = records.map((item) => ({ ...item, scopeLabel: nameOf(item.companyId, item.unitId) }));
    return <PanelShell
    tenantName={tenant.name}
    current="/desvios"
    title="Desvios de SST"
    actions={<>{membership.role === "trabalhador" && <a className="secondary-button" href="/passaporte-demo">Passaporte de demonstração</a>}{canManage && <a className="secondary-button" href="/relatorios/desvios">Relatório de desvios</a>}</>}
  >
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Desvios de SST</h1><p className="page-description">Qualquer pessoa pode relatar um desvio ou um quase incidente.</p></div></section>
      <DeviationSection companies={companies} items={items} canManage={canManage}/>
    </div>
  </PanelShell>;
}
