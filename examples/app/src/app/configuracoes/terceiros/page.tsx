import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listThirdPartyRigorPolicies } from "@/lib/third-party-rigor-policy";
import ReconciliationPanel from "./reconciliation-panel";

export default function ThirdPartyPolicyPage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo política de terceiros…</main>}><ThirdPartyPolicyContent/></Suspense>;
}

async function ThirdPartyPolicyContent() {
  await connection();
  const access = await getCurrentTenantAccess("thirdparty.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !hasTenantPermission(access.context.membership.role, "thirdparty.read")) redirect("/sem-acesso");
  const policies = listThirdPartyRigorPolicies(access.context.tenant.id);
  const canReconcile = hasTenantPermission(access.context.membership.role, "tenant.clients.read");
  return <main className="contractor-report"><Link href="/?section=terceiros">Voltar a Terceiros</Link><h1>Política de rigor de terceiros</h1><p>Consulta da política interna usada no relatório de mobilização.</p>{policies.map(policy => <section key={`${policy.companyId}-${policy.unitId}`}><h2>Versão {policy.version}</h2><p>Vigente desde {policy.validFrom?.split("-").reverse().join("/") || "não registrada"} · revisão: {policy.reviewer}</p><ul>{Object.entries(policy.levels).map(([document, level]) => <li key={document}><strong>{document}</strong> · {level === "authorization" ? "Exigir autorização" : level === "block" ? "Bloquear integração" : "Informar"}</li>)}</ul></section>)}{canReconcile && <ReconciliationPanel/>}</main>;
}
