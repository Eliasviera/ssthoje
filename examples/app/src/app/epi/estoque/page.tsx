import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listEpiStock } from "@/lib/epi-stock-store";
import { getEpiDeliveryForStock } from "@/lib/epi-service";
import StockSection from "./section";
export default function Page({searchParams}:{searchParams:Promise<{delivery?:string;mode?:string;companyId?:string}>}){return <Suspense fallback={<main className="auth-loading">Abrindo estoque…</main>}><Content searchParams={searchParams}/></Suspense>;}
async function Content({searchParams}:{searchParams:Promise<{delivery?:string;mode?:string;companyId?:string}>}){
  await connection();
  const access=await getCurrentTenantAccess("epi.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const {tenant,membership}=access.context;
  const canManage=hasTenantPermission(membership.role,"epi.manage") && !!(await getCurrentTenantAccess("epi.manage")).context;
  const params=await searchParams;
  const companies=await listClientCompanies(tenant.id);
  const scopedCompany=params.companyId?companies.find(company=>company.id===params.companyId&&company.status==="active"):undefined;
  if(params.companyId&&!scopedCompany) notFound();
  const deliveryContext=canManage&&params.delivery?getEpiDeliveryForStock(access.session.userId,params.delivery):null;
  if(params.delivery&&scopedCompany&&deliveryContext?.companyId!==scopedCompany.id) notFound();
  const deliveryMissing=canManage&&!!params.delivery&&!deliveryContext;
  const movementMode=params.mode==="return"?"return":"exit";
  const visibleItems=listEpiStock(access.session.userId).filter(item=>!scopedCompany||item.companyId===scopedCompany.id);
  const visibleCompanies=scopedCompany?[scopedCompany]:companies;
  return <main className="main-area" style={{marginLeft:0}}><header className="topbar"><Link className="secondary-button" href={scopedCompany?`/empresas/${scopedCompany.id}?tab=epi`:"/epi/entregas"}>{scopedCompany?"Voltar à empresa":"Voltar às entregas"}</Link><Link className="secondary-button" href={scopedCompany?`/epi/entregas?companyId=${encodeURIComponent(scopedCompany.id)}`:"/epi/fichas"}>{scopedCompany?"Entregas desta empresa":"Fichas de EPI"}</Link></header><div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">{tenant.name} · DEMONSTRAÇÃO</p><h1>Estoque de EPI{scopedCompany?` · ${scopedCompany.tradeName||scopedCompany.legalName}`:""}</h1><p className="page-description">Compras, almoxarifado, lotes, saídas por ficha e devoluções com histórico.</p></div></section><StockSection items={visibleItems} companies={visibleCompanies} canManage={canManage} deliveryContext={deliveryContext?{id:deliveryContext.id,workerName:deliveryContext.workerName,status:deliveryContext.status,items:deliveryContext.items.map(item=>({ca:item.ca??"",size:item.size,quantity:item.quantity}))}:undefined} deliveryMissing={deliveryMissing} movementMode={movementMode}/></div></main>;
}
