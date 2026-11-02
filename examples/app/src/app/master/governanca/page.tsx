import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { getOperationsGovernance } from "@/lib/operations-governance";
import GovernancePanel from "./panel";
export default function GovernancePage(){return <Suspense fallback={<main><p role="status">Carregando governança…</p></main>}><Content/></Suspense>;}
async function Content(){await connection();const session=await getSession();if(!session)redirect("/login");try{requirePlatformMaster(session.userId);}catch{redirect("/sem-acesso");}return <GovernancePanel data={getOperationsGovernance(session.userId)}/>;}

