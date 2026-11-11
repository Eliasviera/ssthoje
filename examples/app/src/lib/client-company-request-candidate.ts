import "server-only";
import type { Pool } from "pg";
import { clientCompanyPostgresCandidate } from "./client-company-postgres-candidate.ts";
import { clientCompanyPermissionReady, type CompanyScopedAccess } from "./client-company-scope.ts";
import { hasTenantPermission } from "./tenant-access.ts";

// Somente candidato: readSession deve verificar assinatura/expiracao e derivar
// tenant do cadastro confiavel. Nao receber identidade por query/formulario.
export function clientCompanyRequestCandidate(pool: Pool, readSession: () => Promise<{ userId: string; tenantId: string } | null>) {
  return {
    async access(permission: string): Promise<CompanyScopedAccess | null> {
      if (!hasTenantPermission("cliente", permission) || !clientCompanyPermissionReady(permission)) return null;
      const session = await readSession();
      if (!session) return null;
      const scope = await clientCompanyPostgresCandidate(pool, async () => session).resolve();
      if (!scope || scope.tenantId !== session.tenantId) return null;
      return { tenant: { id: session.tenantId }, membership: { role: "cliente" }, companyScope: scope };
    },
  };
}
