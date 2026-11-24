import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import { accidentPendencies, listAccidents } from "@/lib/accident-store";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import AccidentSection from "./section";
import TopbarActions from "../field-nav";
import PanelShell from "../panel-shell";

export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo acidentes…</main>}><Content/></Suspense>;
}

async function Content() {
  await connection();
  const access = await getCurrentTenantAccess("accident.report");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant, membership } = access.context;
  const canManage = (await getCurrentTenantAccess("accident.manage")).context !== null;
  const canSeeSensitive = (await getCurrentTenantAccess("accident.sensitive.read")).context !== null;
  const companies = scopeClientCompanies(access.context, await listClientCompanies(tenant.id));
  const all = listAccidents(tenant.id, { userId: access.session.userId, canManage, canSeeSensitive });
  const records = membership.role === "cliente"
    ? all.filter((row) => companies.some((company) => company.id === row.companyId && company.units.some((unit) => unit.id === row.unitId)))
    : all;
  const nameOf = (companyId: string, unitId: string) => {
    const company = companies.find((item) => item.id === companyId);
    const unit = company?.units.find((item) => item.id === unitId);
    return company ? `${company.tradeName || company.legalName}${unit ? ` · ${unit.name}` : ""}` : "";
  };
  for (const record of records) {
    if (canSeeSensitive && record.medical) {
      appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "accident.medical_read", targetId: record.id });
    }
  }
  const items = records.map((item) => ({ ...item, pending: accidentPendencies(item), scopeLabel: nameOf(item.companyId, item.unitId) }));
  return <PanelShell tenantName={tenant.name} current="/acidentes">
    <div className="content-wrap">
      <section className="welcome-row"><div><p className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</p><h1>Acidentes e CAT</h1><p className="page-description">Registre o acidente, monte a CAT e controle as pendências. A transmissão continua sendo feita pelo cliente no eSocial ou no CATWeb.</p></div></section>
      <AccidentSection companies={companies} items={items} canManage={canManage} canSeeSensitive={canSeeSensitive}/>
    </div>
  </PanelShell>;
}
