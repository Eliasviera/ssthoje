import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { listNonconformities } from "@/lib/nonconformity-store";
import NcSection, { type NcPrefill } from "./section";

function param(value: string | string[] | undefined, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main className="auth-loading">Abrindo relatórios…</main>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const query = await searchParams;
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const title = param(query.title, 140);
  const prefill: NcPrefill | undefined = title ? { scope: param(query.scope, 281), title, location: param(query.location, 500), description: param(query.description, 2000), evidence: param(query.evidence, 2000) } : undefined;
  return <main className="main-area" style={{marginLeft:0}}>
    <header className="topbar"><div className="breadcrumbs">{tenant.name} / Não conformidades</div><Link className="secondary-button" href="/#safety-apr">Voltar ao painel</Link></header>
    <div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Relatórios de não conformidade</h1><p className="page-description">Registre a ocorrência e acompanhe sua correção até a revisão humana.</p></div></section>
      <NcSection companies={companies} records={listNonconformities(tenant.id)} prefill={prefill}/>
    </div>
  </main>;
}
