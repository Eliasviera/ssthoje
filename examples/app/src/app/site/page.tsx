import { Suspense } from "react";
import { connection } from "next/server";
import { getPublicSiteContent } from "@/lib/site-service";
import Landing from "./landing";
export default function SitePage() { return <Suspense fallback={<main>Carregando SST Hoje…</main>}><PublicContent/></Suspense>; }
async function PublicContent() { await connection(); return <Landing content={await getPublicSiteContent()}/>; }
