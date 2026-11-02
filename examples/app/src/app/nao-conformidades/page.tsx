import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listNonconformities } from "@/lib/nonconformity-store";
import NcSection from "./section";
export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo relatórios…</main>}><Content/></Suspense>;
}
async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant } = access.context;
  const companies = await listClientCompanies(tenant.id);
  return <main className="main-area" style={{marginLeft:0}}>
    <header className="topbar"><div className="breadcrumbs">{tenant.name} / Não conformidades</div><Link className="secondary-button" href="/#safety-apr">Voltar ao painel</Link></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Relatórios de não conformidade</h1><p className="page-description">Registre a ocorrência e acompanhe sua correção até a revisão humana.</p></div></section>
      <NcSection companies={companies} records={listNonconformities(tenant.id)}/>
    </div>
  </main>;
}
