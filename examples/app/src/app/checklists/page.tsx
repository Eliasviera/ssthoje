import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listInspections, listTemplates } from "@/lib/checklist-store";
import ChecklistSection from "./section";
import TopbarActions from "../field-nav";

export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo checklists…</main>}><Content/></Suspense>;
}
async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("checklist.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant, membership } = access.context;
  const canApply = (await getCurrentTenantAccess("checklist.apply")).context !== null;
  const canManage = (await getCurrentTenantAccess("checklist.manage")).context !== null;
  const companies = await listClientCompanies(tenant.id);
  const inspections = listInspections(tenant.id).map(({ signature, ...rest }) => ({ ...rest, signedAt: signature.signedAt }));
  return <main className="main-area" style={{marginLeft:0}}>
    <header className="topbar"><div className="breadcrumbs">{tenant.name} / Checklists</div><TopbarActions role={membership.role} current="/checklists"/></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Checklists de áreas e equipamentos</h1><p className="page-description">Modelos criados pela própria equipe; o sistema não traz critérios normativos.</p></div></section>
      <ChecklistSection companies={companies} templates={listTemplates(tenant.id)} inspections={inspections} canApply={canApply} canManage={canManage}/>
    </div>
  </main>;
}
