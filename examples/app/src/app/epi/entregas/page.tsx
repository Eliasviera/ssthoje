import {Suspense} from "react";
import {createHash} from "node:crypto";
import Link from "next/link";
import {connection} from "next/server";
import {notFound,redirect} from "next/navigation";
import {getCurrentTenantAccess} from "@/lib/tenant-context";
import {hasTenantPermission} from "@/lib/tenant-access";
import {getEpiDeliveryStockReconciliation,listEpiDeliveries,listEpiWorkers,listOfflineEpiSubmissions} from "@/lib/epi-service";
import {listClientCompanies} from "@/lib/client-service";
import EpiSection from "../../epi-section";
import EpiOfflineCapture from "./offline-capture";

export default function Page({searchParams}:{searchParams:Promise<{companyId?:string}>}){return <Suspense fallback={<main className="auth-loading">Abrindo entregas de EPI…</main>}><Content searchParams={searchParams}/></Suspense>;}
async function Content({searchParams}:{searchParams:Promise<{companyId?:string}>}){
  await connection();
  const access=await getCurrentTenantAccess("epi.read");
  if(!access.authenticated) redirect("/login");
  if(!access.context) redirect("/sem-acesso");
  const {tenant,membership}=access.context;
  const params=await searchParams;
  const companies=await listClientCompanies(tenant.id);
  const scopedCompany=params.companyId?companies.find(company=>company.id===params.companyId&&company.status==="active"):undefined;
  if(params.companyId&&!scopedCompany) notFound();
  const canManage=hasTenantPermission(membership.role,"epi.manage")&&!!(await getCurrentTenantAccess("epi.manage")).context;
  const deliveries=listEpiDeliveries(access.session.userId).filter(delivery=>!scopedCompany||delivery.companyId===scopedCompany.id)
    .map(delivery=>({...delivery,stockReconciliation:getEpiDeliveryStockReconciliation(access.session.userId,delivery)}));
  const offlineSubmissions=listOfflineEpiSubmissions(access.session.userId).filter(record=>!scopedCompany||record.companyId===scopedCompany.id);
  const workers=canManage?listEpiWorkers(access.session.userId).filter(worker=>!scopedCompany||worker.companyId===scopedCompany.id):[];
  const currentDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const offlineScopeKey=createHash("sha256").update(`${tenant.id}:${access.session.userId}`).digest("hex");
  return <main className="main-area" style={{marginLeft:0}}><header className="topbar"><Link className="secondary-button" href={scopedCompany?`/empresas/${scopedCompany.id}?tab=epi`:"/empresas"}>{scopedCompany?"Voltar à empresa":"Voltar às empresas"}</Link><Link className="secondary-button" href={scopedCompany?`/epi/estoque?companyId=${encodeURIComponent(scopedCompany.id)}`:"/epi/estoque"}>Estoque de EPI</Link><Link className="secondary-button" href="/epi/fichas">Fichas por trabalhador</Link></header><div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">{tenant.name} · DEMONSTRAÇÃO</p><h1>Entregas de EPI{scopedCompany?` · ${scopedCompany.tradeName||scopedCompany.legalName}`:""}</h1><p className="page-description">Registre a entrega, consulte a ficha e concilie a baixa pelo estoque do CA e tamanho correspondente.</p></div></section><EpiOfflineCapture workers={workers} submissions={offlineSubmissions} canManage={canManage} scopeKey={offlineScopeKey} currentDate={currentDate}/><EpiSection deliveries={deliveries} workers={workers} canManage={canManage} currentDate={currentDate} companyScopeId={scopedCompany?.id}/></div></main>;
}
