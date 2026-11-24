import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { getIntegrationSandbox } from "@/lib/integration-service";
import { listRuntimeTenants } from "@/lib/tenant-access";
import SandboxPanel from "./panel";
import InboxPanel from "./inbox-panel";
import { asaasConfig, asaasReady, listAsaasInbox } from "@/lib/asaas-inbox";
import { listSandboxOtps } from "@/lib/otp-sandbox";
import OtpPanel from "./otp-panel";
import StoragePanel from "./storage-panel";
import { getObjectStorageProbe } from "@/lib/object-storage-probe";
export default function SandboxPage() { return <Suspense fallback={<main>Carregando bancada…</main>}><SandboxContent/></Suspense>; }
async function SandboxContent() {
  await connection(); const session = await getSession(); if (!session) redirect("/login");
  try { requirePlatformMaster(session.userId); } catch { redirect("/sem-acesso"); }
  return <><SandboxPanel runs={getIntegrationSandbox(session.userId)} tenants={listRuntimeTenants().map(t => ({id:t.id,name:t.name}))} requestKey={randomUUID()}/><StoragePanel status={getObjectStorageProbe(session.userId)}/><InboxPanel events={listAsaasInbox(session.userId)} ready={asaasReady(asaasConfig())}/><OtpPanel rows={listSandboxOtps(session.userId)}/></>;
}
