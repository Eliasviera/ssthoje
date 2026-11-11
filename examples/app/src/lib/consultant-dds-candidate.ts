import "server-only";
import type { Pool } from "pg";
import { listDds } from "./dds-store.ts";
import { renderDdsPdf } from "./dds-pdf-renderer.ts";
import { consultancyServicePostgresCandidate } from "./consultancy-service-postgres-candidate.ts";

// Fatia candidata: sessao confiavel, ID e escopo do recurso resolvidos no servidor.
// Nao recebe empresa/unidade do navegador para decidir a autorizacao.
export function consultantDdsCandidate(pool: Pool, authenticate: () => Promise<{ userId: string; tenantId: string } | null>) {
  async function read(id: string) {
    const actor = await authenticate();
    if (!actor) return null;
    const record = listDds(actor.tenantId).find((row) => row.id === id);
    if (!record || !await consultancyServicePostgresCandidate(pool, async () => actor).canUse(record.companyId, record.unitId, "dds.read")) return null;
    return record;
  }
  return {
    read,
    async pdf(id: string) {
      const record = await read(id);
      return record ? renderDdsPdf(record) : new Response("DDS indisponível.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    },
  };
}
