import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listDeviations } from "@/lib/deviation-store";
import DeviationSection from "./section";
import TopbarActions from "../field-nav";

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
  const canPickScope = canManage || (await getCurrentTenantAccess("checklist.apply")).context !== null;
  const companies = canPickScope ? await listClientCompanies(tenant.id) : [];
  const records = listDeviations(tenant.id, { userId: access.session.userId, canManage });
  const nameOf = (companyId: string, unitId: string) => {
    const company = companies.find((item) => item.id === companyId);
    const unit = company?.units.find((item) => item.id === unitId);
    return company ? `${company.tradeName || company.legalName}${unit ? ` · ${unit.name}` : ""}` : "";
  };
  const items = records.map((item) => ({ ...item, scopeLabel: nameOf(item.companyId, item.unitId) }));
  return <main className="main-area" style={{marginLeft:0}}>
    <header className="topbar"><div className="breadcrumbs">{tenant.name} / Desvios de SST</div><TopbarActions role={membership.role} current="/desvios"/></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Desvios de SST</h1><p className="page-description">Qualquer pessoa pode relatar um desvio ou um quase incidente.</p></div></section>
      <DeviationSection companies={companies} items={items} canManage={canManage}/>
    </div>
  </main>;
}
