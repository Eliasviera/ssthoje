import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { isPlatformMaster } from "@/lib/platform-identity";
import { listClientCompanies } from "@/lib/client-service";
import { getPgrStorageMode } from "@/lib/pgr-storage-mode";
import { listPgrDraftsForTenant } from "@/lib/pgr-store";
import { listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import type { PgrInventoryRecord } from "@/lib/pgr-postgres-operations";
import PgrSection from "@/app/pgr-section";

export default function PgrPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo PGR…</main>}><PgrPageContent /></Suspense>;
}

async function PgrPageContent() {
  await connection();
  const access = await getCurrentTenantAccess("tenant.dashboard.read");
  if (!access.authenticated) redirect("/login");
  if (isPlatformMaster(access.session.userId)) redirect("/master");
  if (!access.context) redirect("/sem-acesso");

  const { membership, tenant } = access.context;
  const canManagePgr = hasTenantPermission(membership.role, "pgr.manage");
  const canManageTable24 = hasTenantPermission(membership.role, "esocial.table24.manage");
  const canReviewDocuments = hasTenantPermission(membership.role, "documents.review");
  const canReadPgr = hasTenantPermission(membership.role, "documents.read");
  const canReadClients = hasTenantPermission(membership.role, "tenant.clients.read");
  const storageMode = getPgrStorageMode();

  const clients = canReadClients ? await listClientCompanies(tenant.id) : [];
  const pgrDrafts = canReadPgr && storageMode === "json" ? listPgrDraftsForTenant(tenant.id) : [];
  let postgresRecords: PgrInventoryRecord[] = [];
  let postgresError: string | undefined;
  if (canReadPgr && storageMode === "postgres") {
    try {
      postgresRecords = await listPgrInventoriesPostgres(tenant.id);
    } catch {
      postgresError = "Não foi possível carregar os inventários no PostgreSQL.";
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">SST Hoje</p>
          <h1>PGR</h1>
          <p>Inventários de risco, revisão e aprovação.</p>
        </div>
        <nav className="app-nav">
          <Link href="/empresas">Empresas</Link>
          <Link href="/trabalhadores">Trabalhadores</Link>
        </nav>
      </header>
      <PgrSection
        records={pgrDrafts}
        companies={clients}
        canManage={canManagePgr}
        canReview={canReviewDocuments}
        canManageTable24={canManageTable24}
        storageMode={storageMode}
        postgresRecords={postgresRecords}
        postgresError={postgresError}
      />
    </main>
  );
}
