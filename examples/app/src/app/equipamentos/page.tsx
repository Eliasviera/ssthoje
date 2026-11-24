import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listEquipment } from "@/lib/equipment-inventory-store";
import { listTemplates, listInspections } from "@/lib/checklist-store";
import EquipmentPanel from "./equipment-panel";
import PanelShell from "../panel-shell";

export const metadata = { title: "Equipamentos — SST Hoje" };

export default function EquipmentPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo equipamentos…</main>}><EquipmentContent/></Suspense>;
}

async function EquipmentContent() {
  await connection();
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { tenant, membership } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const equipment = listEquipment(tenant.id);
  const templates = listTemplates(tenant.id).filter((template) => template.kind === "equipment" && template.status === "active");
  const inspections = listInspections(tenant.id);
  const canManage = hasTenantPermission(membership.role, "operations.manage");

  return <PanelShell tenantName={tenant.name} current="/equipamentos">
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p>
          <h1 id="page-title">Inventário de Equipamentos</h1>
          <p className="page-description">Cadastre as máquinas e acompanhe as inspeções: saber quando um equipamento não foi inspecionado no período.</p>
        </div>
      </section>
      <EquipmentPanel equipment={equipment} companies={companies} templates={templates} inspections={inspections} canManage={canManage}/>
    </div>
  </PanelShell>;
}
