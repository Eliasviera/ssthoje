import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listAsoWorkers, listMedicalAsos } from "@/lib/aso-service";
import AsoSection from "../aso-section";
import { logoutAction } from "../actions";
import PanelShell from "../panel-shell";

export const metadata = { title: "ASO — SST Hoje" };

export default function AsoPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo ASOs…</main>}><MedicalAsos /></Suspense>;
}

async function MedicalAsos() {
  await connection();
  const access = await getCurrentTenantAccess("aso.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { userId } = access.session;
  const [records, workers] = await Promise.all([listMedicalAsos(userId), listAsoWorkers(userId)]);

  return <PanelShell tenantName={access.context.tenant.name} current="/aso">
    <div className="content-wrap">
      <AsoSection records={records} workers={workers} summaries={[]} isMedical />
    </div>
  </PanelShell>;
}
