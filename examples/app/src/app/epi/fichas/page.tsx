import {Suspense} from "react";
import Link from "next/link";
import {connection} from "next/server";
import {notFound,redirect} from "next/navigation";
import {getCurrentTenantAccess} from "@/lib/tenant-context";
import {getEpiDeliveryStockReconciliation,listEpiDeliveries} from "@/lib/epi-service";
import WorkerFicha from "../worker-ficha";
import {listClientCompanies} from "@/lib/client-service";
export default function Page({searchParams}:{searchParams:Promise<{companyId?:string}>}){return <Suspense fallback={<main className="auth-loading">Abrindo fichas…</main>}><Content searchParams={searchParams}/></Suspense>;}
async function Content({searchParams}:{searchParams:Promise<{companyId?:string}>}){
  await connection();
  const access=await getCurrentTenantAccess("epi.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const params=await searchParams;
  const companies=await listClientCompanies(access.context.tenant.id);
  const scopedCompany=params.companyId?companies.find(company=>company.id===params.companyId&&company.status==="active"):undefined;
  if(params.companyId&&!scopedCompany) notFound();
  const deliveries=listEpiDeliveries(access.session.userId).filter(delivery=>!scopedCompany||delivery.companyId===scopedCompany.id)
    .map(delivery=>({...delivery,stockReconciliation:getEpiDeliveryStockReconciliation(access.session.userId,delivery)}));
  const workerIds=[...new Set(deliveries.map(d=>d.workerId))];
  return <main className="main-area" style={{marginLeft:0}}><header className="topbar"><Link className="secondary-button" href={scopedCompany?`/empresas/${scopedCompany.id}?tab=epi`:"/epi/entregas"}>{scopedCompany?"Voltar à empresa":"Voltar às entregas"}</Link><Link className="secondary-button" href={scopedCompany?`/epi/estoque?companyId=${encodeURIComponent(scopedCompany.id)}`:"/epi/estoque"}>Estoque de EPI</Link></header><div className="content-wrap"><section className="welcome-row"><div><p className="eyebrow">{access.context.tenant.name} · DEMONSTRAÇÃO</p><h1>Fichas de EPI{scopedCompany?` · ${scopedCompany.tradeName||scopedCompany.legalName}`:" por trabalhador"}</h1><p className="page-description">Histórico de entregas agrupado por trabalhador, com impressão individual da ficha.</p></div></section><section className="panel pgr-section epi-section"><div className="document-warning">Ficha demonstrativa. As confirmações do simulador não comprovam identidade nem assinatura. Referências, CA, seleção, treinamento e validade do produto exigem conferência documental pela equipe responsável.</div>{!workerIds.length&&<p className="permission-note">Nenhuma entrega disponível para compor uma ficha.</p>}{workerIds.map(workerId=>{
    const records=deliveries.filter(d=>d.workerId===workerId);
    return <article className="pgr-card" key={workerId}><h2>{records[0].workerName}</h2><p>{records.length} registro(s) de entrega</p><WorkerFicha workerName={records[0].workerName} records={records}/>{records.filter(d=>d.confirmation).map(d=><p key={d.id}><Link className="secondary-button" href={`/epi/comprovante/${d.id}`}>Abrir comprovante fictício · {d.deliveredOn.split("-").reverse().join("/")}</Link></p>)}</article>;
  })}</section></div></main>;
}
