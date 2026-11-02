import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { analyzeRigorPolicies } from "./third-party-rigor-analysis.mjs";
import { reconcileRigorScopesWithDatabase } from "./third-party-rigor-postgres-reconciliation.mjs";
import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import { assertCurrentTenantMembershipParity, TenantTransactionAccessError, withCurrentTenantReadTransaction } from "./tenant-read-transaction";

type Policy={tenantId:string;companyId:string;unitId:string};
type PolicyFile={policies?:Policy[]};

/** Apenas reconciliação administrativa candidate; não está ligada à publicação da análise. */
export async function reconcileCurrentTenantRigorPolicyScopes(){
  return withCurrentTenantReadTransaction("tenant.clients.read",undefined,async(client:PoolClient,context)=>{
    if (!hasTenantPermission(context.membershipRole, "thirdparty.read") || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client,context);
    const source=JSON.parse(readFileSync(join(process.cwd(),"data","third-party-rigor-policies.json"),"utf8")) as PolicyFile;
    const validation=analyzeRigorPolicies(source);
    if(validation.errors.length)throw new Error("A origem da política precisa de correção estrutural antes da reconciliação.");
    return reconcileRigorScopesWithDatabase(client,context.tenantId,source.policies??[]);
  });
}
