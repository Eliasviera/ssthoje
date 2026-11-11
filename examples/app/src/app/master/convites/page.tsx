import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTrialAdministration } from "@/lib/trial-invite-service";
import InvitePanel from "./panel";
export default function Page() { return <Suspense fallback={<p>Abrindo convites…</p>}><Content/></Suspense>; }
async function Content() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  let data;
  try { data = getTrialAdministration(session.userId); } catch { redirect("/sem-acesso"); }
  return <main style={{ maxWidth: 800, margin: "2rem auto", padding: "1rem" }}><a href="/master">Voltar à administração</a><h1>Convites para testadores</h1><InvitePanel data={data}/></main>;
}
