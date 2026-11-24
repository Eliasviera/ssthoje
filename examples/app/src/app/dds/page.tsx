import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listWorkersForTenant } from "@/lib/worker-store";
import { listDdsForAccess } from "@/lib/company-scoped-reads";
import { listActiveDdsTopics } from "@/lib/dds-topic-catalog";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import DdsSection from "./section";

import PanelShell from "../panel-shell";

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
  const companies = scopeClientCompanies(access.context, await listClientCompanies(tenant.id));
  const workers = canManage ? listWorkersForTenant(tenant.id).filter((worker) => worker.status === "active").map((worker) => ({ id: worker.id, name: worker.displayName, jobTitle: worker.jobTitle, companyId: worker.companyId })) : [];
    return <PanelShell
    tenantName={tenant.name}
    current="/dds"
    title="DDS"
    actions={membership.role === "campo" ? <a className="secondary-button" href="/passaporte-demo">Ensaio do Passaporte</a> : null}
  >
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Diálogo Diário de Segurança</h1><p className="page-description">O responsável conduz e assina; os participantes assinam na tela.</p></div></section>
      <DdsSection companies={companies} workers={workers} records={listDdsForAccess(access.context)} topics={listActiveDdsTopics()} canManage={canManage}/>
    </div>
  </PanelShell>;
}
