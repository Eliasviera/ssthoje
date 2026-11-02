import "server-only";
import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import { assertCurrentTenantMembershipParity, TenantTransactionAccessError, withCurrentTenantReadTransaction } from "./tenant-read-transaction";
import { listThirdPartySnapshotsInTransaction } from "./third-party-postgres-read-operations";

// Candidato desconectado: nenhum seletor ou serviço ativo importa este módulo.
export function listThirdPartySnapshotsPostgres() {
  return withCurrentTenantReadTransaction("thirdparty.read", undefined, async (client, context) => {
    if (!hasTenantPermission(context.membershipRole, "thirdparty.read") || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);
    return listThirdPartySnapshotsInTransaction(client, context.tenantId);
  });
}
