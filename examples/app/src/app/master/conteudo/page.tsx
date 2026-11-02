import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { getSiteEditor } from "@/lib/site-service";
import ContentEditor from "./editor";
export default function EditorPage() { return <Suspense fallback={<main>Carregando editor…</main>}><EditorContent/></Suspense>; }
async function EditorContent() {
  await connection(); const session = await getSession(); if (!session) redirect("/login");
  try { requirePlatformMaster(session.userId); } catch { redirect("/sem-acesso"); }
  return <ContentEditor data={await getSiteEditor(session.userId)}/>;
}
