import "server-only";
import type { Pool, PoolClient } from "pg";

// Nenhuma rota ativa importa este repositorio. Sessao/pool sao injetados pelo host.
export function consultancyServicePostgresCandidate(pool: Pool, authenticate: () => Promise<{ userId: string; tenantId: string } | null>) {
  async function run<T>(operation: (client: PoolClient) => Promise<T>) {
    const actor = await authenticate();
    if (!actor?.userId || !actor.tenantId) throw new Error("Autenticação obrigatória.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE consultancy_service_candidate_app");
      await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [actor.userId, actor.tenantId]);
      const result = await operation(client);
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return {
    preview(proposalId: string, authorityReviewId: string) {
      return run(async (client) => (await client.query<{ value: { id: string; revision: number; status: string; tenantId: string; companyId: string; unitId: string; description: string; validUntil: string } }>("SELECT consultancy_service_candidate.preview($1,$2) AS value", [proposalId, authorityReviewId])).rows[0].value);
    },
    propose(input: { companyId: string; unitId: string; description: string; validUntil: string }) {
      return run(async (client) => (await client.query<{ id: string }>("SELECT consultancy_service_candidate.propose($1,$2,$3,$4) AS id", [input.companyId, input.unitId, input.description, input.validUntil])).rows[0].id);
    },
    decide(input: { proposalId: string; expectedRevision: number; choice: "confirmed" | "rejected" | "revoked"; authorityReviewId: string }) {
      return run(async (client) => (await client.query<{ value: { id: string; revision: number; status: string } }>("SELECT consultancy_service_candidate.decide($1,$2,$3,$4) AS value", [input.proposalId, input.expectedRevision, input.choice, input.authorityReviewId])).rows[0].value);
    },
    canUse(companyId: string, unitId: string, permission: string) {
      return run(async (client) => (await client.query<{ value: boolean }>("SELECT consultancy_service_candidate.can_use($1,$2,$3) AS value", [companyId, unitId, permission])).rows[0].value);
    },
  };
}
