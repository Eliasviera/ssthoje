import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster, getPlatformOverview } from "@/lib/platform-service";
import MasterDashboard from "./master-dashboard";
import { getBillingOverview } from "@/lib/billing-service";

export default function MasterPage() { return <Suspense fallback={<main className="auth-loading">Abrindo administração…</main>}><MasterContent/></Suspense>; }
async function MasterContent() {
  await connection(); const session = await getSession(); if (!session) redirect("/login");
  try { requirePlatformMaster(session.userId); } catch { redirect("/sem-acesso"); }
  return <MasterDashboard overview={getPlatformOverview(session.userId)} billingOverview={getBillingOverview(session.userId)}/>;
}
