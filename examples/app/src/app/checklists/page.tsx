import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listTemplates } from "@/lib/checklist-store";
import { listEquipment } from "@/lib/equipment-inventory-store";
import { listInspectionsForAccess } from "@/lib/company-scoped-reads";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import ChecklistSection from "./section";
import TopbarActions from "../field-nav";
import PanelShell from "../panel-shell";

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
  const companies = scopeClientCompanies(access.context, await listClientCompanies(tenant.id));
  const inspections = listInspectionsForAccess(access.context).map(({ signature, ...rest }) => ({ ...rest, signedAt: signature.signedAt }));
  const templates = membership.role === "cliente" ? [] : listTemplates(tenant.id);
  return <PanelShell tenantName={tenant.name} current="/checklists">
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Checklists de áreas e equipamentos</h1><p className="page-description">Modelos criados pela própria equipe; o sistema não traz critérios normativos.</p></div></section>
      <ChecklistSection companies={companies} templates={templates} inspections={inspections} equipment={listEquipment(tenant.id)} canApply={canApply} canManage={canManage}/>
    </div>
  </PanelShell>;
}
