import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";
import { listDds } from "@/lib/dds-store";
import DdsSection from "./section";
import TopbarActions from "../field-nav";

export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo DDS…</main>}><Content/></Suspense>;
}
async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("dds.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant, membership } = access.context;
  const canManage = (await getCurrentTenantAccess("dds.manage")).context !== null;
  const companies = await listClientCompanies(tenant.id);
  const workers = listWorkersForTenant(tenant.id).filter((worker) => worker.status === "active").map((worker) => ({ id: worker.id, name: worker.displayName, jobTitle: worker.jobTitle, companyId: worker.companyId }));
  return <main className="main-area" style={{marginLeft:0}}>
    <header className="topbar"><div className="breadcrumbs">{tenant.name} / DDS</div><TopbarActions role={membership.role} current="/dds"/></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Diálogo Diário de Segurança</h1><p className="page-description">O responsável conduz e assina; os participantes assinam na tela.</p></div></section>
      <DdsSection companies={companies} workers={workers} records={listDds(tenant.id)} canManage={canManage}/>
    </div>
  </main>;
}
