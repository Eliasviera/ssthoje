import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireTenantAccess } from "@/lib/tenant-access";
import catalog from "@/lib/government-integrations-catalog.json";

export const metadata = { title: "Integrações governamentais — SST Hoje" };

const capabilityLabels: Record<string, string> = {
  reference_only: "Referência disponível",
  prepare_document: "Documento preparatório disponível",
  manual_external: "Transmissão manual pelo cliente",
  manual_lookup: "Consulta manual",
  none: "Ainda sem fluxo no sistema",
};

const integrationLabels: Record<string, string> = {
  not_started: "Não iniciada",
  documented_only: "Documentada; sem integração",
  contract_candidate: "Contrato candidato; não conectado",
  mock_only: "Somente simulação",
  homologation_pending: "Homologação pendente",
  homologation_approved: "Homologação aprovada",
  production_authorized: "Produção autorizada por cliente",
  suspended: "Suspensa",
};

export default function GovernmentIntegrationsPage() {
  return <Suspense fallback={<main><p role="status">Carregando catálogo…</p></main>}><Content /></Suspense>;
}

async function Content() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  const access = requireTenantAccess(session.userId, "tenant.dashboard.read");
  if (!access.ok) redirect("/sem-acesso");

  return <main className="platform-shell government-integrations-shell">
    <header className="platform-top"><Link href="/referencias">← Referências</Link></header>
    <section className="platform-intro">
      <p>CATÁLOGO DE SERVIÇOS</p>
      <h1>Integrações governamentais</h1>
      <p>Consulte os serviços mapeados e o que falta antes de preparar um envio para cada empresa cliente.</p>
    </section>
    <section className="government-integration-warning" aria-labelledby="government-integration-status">
      <strong id="government-integration-status">Nenhum envio está conectado</strong>
      <p>Esta tela apresenta o catálogo planejado. O SST Hoje ainda não transmite dados a órgãos governamentais; autorizações, certificados, aprovações e recibos exibidos aqui não são cadastrados nem simulados.</p>
    </section>
    <div className="government-integration-list">
      {catalog.services.map((service) => <article className="government-integration-card" key={service.id}>
        <header>
          <div><p className="government-integration-agency">{service.agency}</p><h2>{service.service}</h2>{service.officialEvent && <p className="government-integration-event">Evento {service.officialEvent}</p>}</div>
          <span className="government-integration-status">{integrationLabels[service.integrationStatus] || "Estado não definido"}</span>
        </header>
        <dl>
          <div><dt>O que existe hoje</dt><dd>{capabilityLabels[service.currentCapability] || "A confirmar"}</dd></div>
          <div><dt>Transmissão pelo SST Hoje</dt><dd>Desativada</dd></div>
          <div><dt>Autorização do cliente</dt><dd>{service.authorization.requiredPerClient ? "Necessária por empresa, se houver envio" : "Não aplicável ao fluxo atual"}</dd></div>
        </dl>
        <ul>{service.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        {service.officialSource && <a className="government-integration-source" href={service.officialSource} target="_blank" rel="noreferrer">Abrir fonte oficial ↗</a>}
      </article>)}
    </div>
    <p className="government-integration-footer">O catálogo é candidato e não cria obrigação atendida. Leiautes, canais e permissões precisam ser conferidos na fonte oficial antes de cada integração.</p>
  </main>;
}
