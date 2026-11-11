import "server-only";
import type { Pool, PoolClient } from "pg";
import type { ClientCompanyScope } from "./client-company-scope.ts";

// Pool e autenticacao explicitamente injetados. Nunca usa getPostgresPool/.env.
// Fronteira candidata atomica SQL: nao executa o adapter em memoria passo a passo.
export function clientCompanyPostgresCandidate(pool: Pool, authenticate: () => Promise<{ userId: string; tenantId: string } | null>) {
  async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const actor = await authenticate();
    if (!actor?.userId || !actor.tenantId) throw new Error("Autenticação obrigatória.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE client_company_candidate_app");
      await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [actor.userId, actor.tenantId]);
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  return {
    change(input: { operation: "grant" | "revoke"; userId: string; companyId: string; unitIds: string[]; validUntil: string; expectedRevision: number; reviewReference: string }) {
      return transaction(async (client) => (await client.query<{ value: { bindingId: string; revision: number; status: string } }>(
        "SELECT client_company_candidate.change_binding($1,$2,$3,$4,$5,$6,$7) AS value",
        [input.operation, input.userId, input.companyId, input.unitIds, input.validUntil, input.expectedRevision, input.reviewReference],
      )).rows[0].value);
    },
    resolve() {
      return transaction(async (client) => (await client.query<{ value: ClientCompanyScope | null }>("SELECT client_company_candidate.resolve_binding() AS value")).rows[0].value);
    },
  };
}
