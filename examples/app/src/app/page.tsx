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
  const membership = session ? resolveTenantMembership(session.userId) : null;
  redirect(membership?.membership.role === "campo" ? "/dds" : "/empresas");
}
