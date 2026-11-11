import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { withCurrentTenantReadTransaction } from "@/lib/tenant-read-transaction";
import { loadCipaOverviewInTransaction } from "@/lib/cipa-overview-read";
import { listPublishedNr5Standards } from "@/lib/nr5-catalog-write";
import CipaSection from "./cipa-section";
import CipaAdminPanel from "./cipa-admin-panel";

export const metadata = { title: "CIPA — SST Hoje" };

export default function CipaPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo CIPA…</main>}><CipaContent /></Suspense>;
}

async function CipaContent() {
  await connection();
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { tenant, membership } = access.context;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const overview = await withCurrentTenantReadTransaction("operations.read", tenant.id, (client, context) =>
    loadCipaOverviewInTransaction(client, context, today));

  const canManage = hasTenantPermission(membership.role, "operations.manage");
  const standards = canManage ? await listPublishedNr5Standards() : [];

  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <div className="breadcrumbs"><span>{tenant.name}</span><span className="crumb-separator">/</span><strong>CIPA</strong></div>
      <Link className="secondary-button" href="/">Voltar ao painel</Link>
    </header>
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p>
          <h1 id="page-title">CIPA</h1>
          <p className="page-description">
            Mandatos, composição e prazos da Comissão Interna de Prevenção de Acidentes e de Assédio,
            conforme a NR-05 (Portaria MTP nº 4.219/2022).
          </p>
        </div>
      </section>
      <CipaSection overview={overview} />
      <CipaAdminPanel
        standards={standards}
        terms={overview.terms.map((term) => ({
          id: term.id,
          label: `${term.companyName} · ${term.unitName} · mandato ${term.termNumber}`,
          endsOn: term.endsOn,
          possessionOn: term.possessionOn,
        }))}
        canManage={canManage}
      />
    </div>
  </main>;
}
