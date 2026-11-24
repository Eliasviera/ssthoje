import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listAsoAuditSignals } from "@/lib/aso-service";
import PanelShell from "../panel-shell";

export const metadata = { title: "Auditoria de NRs — SST Hoje" };

export default function NrAuditPage() {
  return (
    <Suspense fallback={<main className="auth-loading">Abrindo auditoria…</main>}>
      <NrAuditContent />
    </Suspense>
  );
}

async function NrAuditContent() {
  await connection();
  const access = await getCurrentTenantAccess("aso.status.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const signals = listAsoAuditSignals(access.session.userId);

  return (
    <PanelShell tenantName={access.context.tenant.name} current="/auditoria-nrs">
    <div className="content-wrap">
        <section className="welcome-row" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">Auditoria de NRs</h1>
            <p className="page-description">
              Acompanhamento de pendências das Normas Regulamentadoras.
            </p>
          </div>
        </section>
        <section className="panel" aria-labelledby="audit-status">
          <div className="panel-heading"><div>
            <h2 id="audit-status">Pendências de ASO</h2>
            <p>Prazo do próximo exame informado pela equipe médica no Atestado de Saúde Ocupacional.</p>
          </div></div>
          {signals.length === 0 ? <p className="client-empty">Nenhum prazo de ASO vencido ou pendente de preenchimento.</p> : (
            <div className="pgr-records">
              {signals.map(signal => <article key={signal.workerId} className="pgr-card">
                <header><div>
                  <h3>{signal.workerName}</h3>
                  <p>{signal.companyName} · {signal.unitName}</p>
                  {signal.dueOn && <p>Prazo informado <time dateTime={signal.dueOn}>{signal.dueOn.split("-").reverse().join("/")}</time></p>}
                </div>
                <span className="period-label">{{
                  overdue: "Prazo vencido",
                  renewal_in_review: "Renovação em revisão",
                  missing_due_date: "Prazo não informado",
                }[signal.status]}</span></header>
              </article>)}
            </div>
          )}
        </section>
      </div>
    </PanelShell>
  );
}
