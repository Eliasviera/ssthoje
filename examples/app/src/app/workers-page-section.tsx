"use client";

import WorkerSection from "./worker-section";
import { useRouter } from "next/navigation";
import type { ClientCompany } from "@/lib/client-store";
import type { WorkerRecord } from "@/lib/worker-store";

export default function WorkersPageSection({ workers, companies, canManage }: { workers: WorkerRecord[]; companies: ClientCompany[]; canManage: boolean }) {
  const router = useRouter();
  return <WorkerSection workers={workers} companies={companies} canManage={canManage} onOpenCompanies={() => router.push("/empresas")} />;
}
