import "server-only";
import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import { assertCurrentTenantMembershipParity, TenantTransactionAccessError, withCurrentTenantReadTransaction } from "./tenant-read-transaction";

export type ThirdPartyGateOverview = { requirementSets: Array<{ id: string; companyId: string; unitId: string; revision: number; items: Array<{ documentKind: string; medicalRestricted: boolean; restrictedNote: string }> }>; rules: Array<{ id: string; title: string; documentKind: string; version: number; sourceTitle: string; reviewer: string; validFrom: string; validUntil: string | null }> };

export async function getThirdPartyGateOverview(): Promise<ThirdPartyGateOverview> {
  return withCurrentTenantReadTransaction("thirdparty.read", undefined, async (client, context) => {
    if (!hasTenantPermission(context.membershipRole, "thirdparty.read") || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    await assertCurrentTenantMembershipParity(client, context);

    const [sets, rules] = await Promise.all([
      client.query<{ id: string; company_id: string; unit_id: string; revision: number }>("SELECT id, company_id, unit_id, revision FROM sst.third_party_requirement_sets WHERE tenant_id=$1 AND status='active' ORDER BY created_at DESC", [context.tenantId]),
      client.query<{ id: string; title: string; document_kind: string; version: number; source_title: string; reviewer: string; valid_from: string; valid_until: string | null }>("SELECT id,title,document_kind,version,source_title,reviewer,valid_from::text,valid_until::text FROM sst.third_party_compliance_rules WHERE tenant_id=$1 AND status='active' ORDER BY created_at DESC", [context.tenantId]),
    ]);
    const requirementSets = await Promise.all(sets.rows.map(async set => {
      const items = await client.query<{ document_kind: string; medical_restricted: boolean; restricted_note: string }>("SELECT document_kind,medical_restricted,restricted_note FROM sst.third_party_requirement_items WHERE tenant_id=$1 AND requirement_set_id=$2 ORDER BY document_kind", [context.tenantId, set.id]);
      return { id: set.id, companyId: set.company_id, unitId: set.unit_id, revision: Number(set.revision), items: items.rows.map(item => ({ documentKind: item.document_kind, medicalRestricted: item.medical_restricted, restrictedNote: item.restricted_note })) };
    }));
    return { requirementSets, rules: rules.rows.map(rule => ({ id: rule.id, title: rule.title, documentKind: rule.document_kind, version: Number(rule.version), sourceTitle: rule.source_title, reviewer: rule.reviewer, validFrom: rule.valid_from, validUntil: rule.valid_until })) };
  });
}
