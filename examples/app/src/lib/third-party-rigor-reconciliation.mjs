export function reconcileRigorSources(policySource, clientSource, auditLines) {
  const policies=policySource?.policies;
  if(!Array.isArray(policies)||!Array.isArray(clientSource)||!Array.isArray(auditLines))
    return {policyCount:0,scopeMatches:0,scopeMismatches:0,companyAuditMatches:0,policyAuditEvents:0,errors:['INVALID_SOURCE_SHAPE'],readyForImport:false};
  const audit=[];
  for(const line of auditLines){try{if(line.trim())audit.push(JSON.parse(line));}catch{return {policyCount:policies.length,scopeMatches:0,scopeMismatches:0,companyAuditMatches:0,policyAuditEvents:0,errors:['INVALID_AUDIT_LINE'],readyForImport:false};}}
  let scopeMatches=0,scopeMismatches=0,companyAuditMatches=0,policyAuditEvents=0;
  for(const policy of policies){
    const company=clientSource.find(item=>item?.tenantId===policy.tenantId&&item?.id===policy.companyId);
    const unit=company?.units?.find(item=>item?.id===policy.unitId);
    if(company?.status==='active'&&unit)scopeMatches++;else scopeMismatches++;
    const events=audit.filter(event=>event?.tenantId===policy.tenantId&&event?.targetId===policy.companyId&&['client.created','client.updated','client.status_changed'].includes(event?.action));
    companyAuditMatches+=events.length;
    policyAuditEvents+=audit.filter(event=>event?.tenantId===policy.tenantId&&event?.action?.startsWith('thirdparty.rigor_policy.')&&event?.targetId===policy.companyId).length;
  }
  const errors=[];
  if(scopeMismatches)errors.push('POLICY_SCOPE_REFERENCE_MISMATCH');
  return {policyCount:policies.length,scopeMatches,scopeMismatches,companyAuditMatches,policyAuditEvents,errors,readyForImport:false};
}
