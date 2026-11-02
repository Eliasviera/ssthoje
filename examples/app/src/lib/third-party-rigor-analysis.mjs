const levels=new Set(['inform','authorization','block']);
const allowed=new Set(['tenantId','companyId','unitId','version','validFrom','createdAt','createdBy','reviewer','defaultLevel','levels']);
const civil=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
export function analyzeRigorPolicies(value) {
  const errors=[],warnings=[];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='policies')||!Array.isArray(value.policies)) {
    return {policyCount:0,errors:['INVALID_CONTAINER'],warnings:[],readyForImport:false};
  }
  const seen=new Set();
  for(const policy of value.policies) {
    if(!policy||typeof policy!=='object'||Array.isArray(policy)){errors.push('INVALID_POLICY');continue;}
    if(Object.keys(policy).some(key=>!allowed.has(key)))errors.push('UNKNOWN_FIELD');
    if(['tenantId','companyId','unitId','reviewer'].some(key=>typeof policy[key]!=='string'||!policy[key].trim()))errors.push('REQUIRED_METADATA');
    if(!Number.isSafeInteger(policy.version)||policy.version<1)errors.push('INVALID_VERSION');
    const scope=JSON.stringify([policy.tenantId,policy.companyId,policy.unitId]);
    if(seen.has(scope))errors.push('DUPLICATE_ACTIVE_SCOPE');seen.add(scope);
    if(policy.validFrom===undefined)warnings.push('MISSING_VALID_FROM');else if(!civil(policy.validFrom))errors.push('INVALID_VALID_FROM');
    if(policy.createdAt===undefined)warnings.push('MISSING_CREATED_AT');else if(typeof policy.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(policy.createdAt)||!Number.isFinite(Date.parse(policy.createdAt)))errors.push('INVALID_CREATED_AT');
    if(policy.createdBy===undefined)warnings.push('MISSING_ACTOR');else if(typeof policy.createdBy!=='string'||!policy.createdBy.trim())errors.push('INVALID_ACTOR');
    if(!levels.has(policy.defaultLevel))errors.push('INVALID_DEFAULT_LEVEL');
    if(!policy.levels||typeof policy.levels!=='object'||Array.isArray(policy.levels)||Object.entries(policy.levels).some(([key,level])=>!key.trim()||!levels.has(level)))errors.push('INVALID_REQUIREMENT_LEVEL');
  }
  return {policyCount:value.policies.length,errors,warnings,readyForImport:false};
}
