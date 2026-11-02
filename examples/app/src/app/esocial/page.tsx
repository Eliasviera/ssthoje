import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listEsocialMappings } from "@/lib/esocial-mapping-store";
import { listAssignedPcmso } from "@/lib/pcmso-service";
import type { PcmsoEsocialSource } from "@/lib/pcmso-esocial-reference";
import EsocialMappingPanel from "./mapping-panel";

export default function EsocialMappingPage() {
  return <Suspense fallback={<main><p role="status">Carregando associações eSocial…</p></main>}>
    <Content />
  </Suspense>;
}

async function Content() {
  await connection();
  const table24 = await getCurrentTenantAccess("esocial.table24.manage");
  if (!table24.authenticated) redirect("/login");
  const table27 = await getCurrentTenantAccess("esocial.table27.manage");
  const context = table24.context ?? table27?.context;
  if (!context) redirect("/sem-acesso");

  const canManageTable27 = hasTenantPermission(context.membership.role, "esocial.table27.manage");
  const [companies, mappings, pcmsoSources] = await Promise.all([
    listClientCompanies(context.tenant.id),
    listEsocialMappings(context.tenant.id),
    canManageTable27 && table27?.context
      ? listAssignedPcmso(table27.session.userId).then((records) => records.flatMap((record) => record.revisions.map(({ version }) => ({
        id: record.id,
        version,
        companyId: record.companyId,
        unitId: record.unitId,
        companyName: record.companyName,
        unitName: record.unitName,
      } satisfies PcmsoEsocialSource))))
      : Promise.resolve([] as PcmsoEsocialSource[]),
  ]);
  return <EsocialMappingPanel
    companies={companies}
    mappings={mappings}
    pcmsoSources={pcmsoSources}
    canManageTable24={hasTenantPermission(context.membership.role, "esocial.table24.manage")}
    canManageTable27={canManageTable27}
  />;
}
