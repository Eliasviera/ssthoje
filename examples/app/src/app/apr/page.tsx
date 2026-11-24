import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listSafetyAprs, listSafetyChecklistTemplates } from "@/lib/safety-operations-store";
import { listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import type { PgrInventoryRecord } from "@/lib/pgr-postgres-operations";
import SafetyOperationsSection from "../safety-operations-section";
import { loadVocabulary } from "@/lib/field-vocabulary";
import { listWorkersForTenant } from "@/lib/worker-store";
import PanelShell from "../panel-shell";

export const metadata = { title: "APR e checklists — SST Hoje" };

export default function AprPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo APR…</main>}><AprContent /></Suspense>;
}

async function AprContent() {
  await connection();
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { tenant, membership } = access.context;
  const canManage = hasTenantPermission(membership.role, "operations.manage") && hasTenantPermission(membership.role, "pgr.manage");

  // A APR parte dos riscos de um PGR aprovado: as empresas vêm do cadastro e os
  // inventários do PostgreSQL, que é a fonte já cortada para o domínio PGR.
  const companies = await listClientCompanies(tenant.id);
  const templates = listSafetyChecklistTemplates(tenant.id);
  const aprs = listSafetyAprs(tenant.id);
  const workers = listWorkersForTenant(tenant.id).filter((worker) => worker.status === "active")
    .map((worker) => ({ id: worker.id, name: worker.displayName, jobTitle: worker.jobTitle, companyId: worker.companyId, unitId: worker.unitId }));

  let inventories: PgrInventoryRecord[] = [];
  let pgrError: string | undefined;
  if (canManage) {
    try {
      inventories = await listPgrInventoriesPostgres(tenant.id);
    } catch (error) {
      pgrError = error instanceof Error ? error.message : "Não foi possível carregar os inventários do PGR.";
    }
  }

  return <PanelShell tenantName={tenant.name} current="/apr">
    <div className="content-wrap">
      <section className="welcome-row" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{tenant.name.toUpperCase()} · AMBIENTE DE DEMONSTRAÇÃO</p>
          <h1 id="page-title">APR e checklists de campo</h1>
          <p className="page-description">
            Cada APR parte dos riscos de um PGR aprovado no escopo da empresa e unidade, e pode registrar
            riscos e medidas adicionais identificados na avaliação da tarefa.
          </p>
        </div>
      </section>

      <SafetyOperationsSection
        templates={templates}
        aprs={aprs}
        companies={companies}
        inventories={inventories}
        canManage={canManage}
        pgrError={pgrError}
        vocabulary={loadVocabulary().entries}
        workers={workers}
      />
    </div>
  </PanelShell>;
}
