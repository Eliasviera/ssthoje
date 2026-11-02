import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { getJobSandbox } from "@/lib/job-sandbox";
import JobPanel from "./panel";
export default function OperationsPage(){return <Suspense fallback={<main><p role="status">Carregando operação…</p></main>}><Content/></Suspense>;}
async function Content(){await connection();const session=await getSession();if(!session)redirect("/login");try{requirePlatformMaster(session.userId);}catch{redirect("/sem-acesso");}return <JobPanel data={getJobSandbox(session.userId)} requestKey={randomUUID()}/>;}

