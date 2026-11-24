import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { resolveTenantMembership } from "@/lib/tenant-access";

export default function HomePage() {
  return <Suspense fallback={<main className="auth-loading">Abrindo…</main>}><Redirector/></Suspense>;
}

async function Redirector(): Promise<never> {
  await connection();
  const session = await getSession();
  if (!session) redirect("/site");

  const membership = resolveTenantMembership(session.userId);
  if (membership?.membership.role === "trabalhador") redirect("/desvios");
  if (membership?.membership.role === "medico_coordenador") redirect("/aso");
  redirect(["campo", "cliente"].includes(membership?.membership.role ?? "") ? "/dds" : "/empresas");
}
