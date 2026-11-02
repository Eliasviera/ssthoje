import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { getSiteEditor } from "@/lib/site-service";
import Landing from "../../../site/landing";
export default function PreviewPage() { return <Suspense fallback={<main>Carregando prévia…</main>}><PreviewContent/></Suspense>; }
async function PreviewContent() {
  await connection(); const session = await getSession(); if (!session) redirect("/login");
  try { requirePlatformMaster(session.userId); } catch { redirect("/sem-acesso"); }
  return <Landing content={(await getSiteEditor(session.userId)).draft.content} preview/>;
}
