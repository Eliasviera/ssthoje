/** Compara apenas referências com uma única leitura PostgreSQL; não traz PII. */
export async function reconcileRigorScopesWithDatabase(client,tenantId,policies){
  const expected=(Array.isArray(policies)?policies:[])
    .filter(policy=>policy?.tenantId===tenantId)
    .map(policy=>({companyId:policy.companyId,unitId:policy.unitId}));
  if(!expected.length)return {policyCount:0,scopeMatches:0,scopeMismatches:0,companiesWithAudit:0,policyHistoryAvailable:false,errors:[],readyForImport:false};
  const result=await client.query(`
    WITH expected AS (
      SELECT * FROM unnest($2::text[],$3::text[]) AS item(company_id,unit_id)
    )
    SELECT expected.company_id,expected.unit_id,company.status,
      (unit.id IS NOT NULL) AS unit_matches,
      COALESCE(audit.event_count,0)::integer AS company_audit_count
    FROM expected
    LEFT JOIN sst.client_companies AS company
      ON company.tenant_id=$1 AND company.id=expected.company_id
    LEFT JOIN sst.client_units AS unit
      ON unit.tenant_id=$1 AND unit.id=expected.unit_id AND unit.company_id=company.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS event_count FROM sst.client_audit_history AS history
      WHERE history.tenant_id=$1 AND history.target_id=company.id
        AND history.action IN ('client.created','client.updated','client.status_changed')
    ) AS audit ON true`,[tenantId,expected.map(item=>item.companyId),expected.map(item=>item.unitId)]);
  const rows=result.rows??[];
  const scopeMatches=rows.filter(row=>row.status==='active'&&row.unit_matches===true).length;
  return {
    policyCount:expected.length,
    scopeMatches,
    scopeMismatches:expected.length-scopeMatches,
    companiesWithAudit:rows.filter(row=>Number(row.company_audit_count)>0).length,
    policyHistoryAvailable:false,
    errors:expected.length===rows.length&&scopeMatches===expected.length?[]:['POLICY_SCOPE_REFERENCE_MISMATCH'],
    readyForImport:false,
  };
}
