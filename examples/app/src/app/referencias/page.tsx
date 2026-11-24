import {Suspense} from "react";
import Link from "next/link";
import {connection} from "next/server";
import {redirect} from "next/navigation";
import {getSession} from "@/lib/session";
import {hasTenantPermission, requireTenantAccess} from "@/lib/tenant-access";
import {getReferenceGovernance} from "@/lib/reference-governance";
import ReferencePanel from "./panel";
import EsocialCatalogSection from "./esocial-catalog-section";

export default function ReferencesPage() {
  return <Suspense fallback={<main><p role="status">Carregando referências…</p></main>}>
    <Content />
  </Suspense>;
}

async function Content() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");

  const tenantAccess = requireTenantAccess(session.userId, "tenant.dashboard.read");
  if (!tenantAccess.ok) redirect("/sem-acesso");

  const role = tenantAccess.context.membership.role;
  const canReviewReferences = hasTenantPermission(role, "documents.review");
  const canOpenMappings = hasTenantPermission(role, "esocial.table24.manage")
    || hasTenantPermission(role, "esocial.table27.manage");

  return <>
    <main className="platform-shell">
      <header className="platform-top">
        <Link href="/">← Área da consultoria</Link>
      </header>
      <section className="platform-intro">
        <p>REFERÊNCIAS TÉCNICAS</p>
        <h1>Consulta eSocial.</h1>
        <p>Tabelas oficiais versionadas para consulta manual.</p>
      </section>
      <section className="government-integrations-shortcut" aria-labelledby="government-integrations-shortcut-title">
        <div><h2 id="government-integrations-shortcut-title">Integrações governamentais</h2><p>Veja serviços mapeados, o que já existe e o que ainda precisa ser preparado. Nenhum envio está conectado.</p></div>
        <Link className="secondary-button" href="/integracoes-governamentais">Abrir catálogo</Link>
      </section>
      <EsocialCatalogSection canOpenMappings={canOpenMappings} />
    </main>
    {canReviewReferences && <ReferencePanel data={getReferenceGovernance(session.userId)} />}
  </>;
}
