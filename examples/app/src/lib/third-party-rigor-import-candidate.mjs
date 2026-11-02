import { createHash } from 'node:crypto';
import { analyzeRigorPolicies } from './third-party-rigor-analysis.mjs';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function prepareLegacyRigorImportCandidate(policySource, clientsSource) {
  const validation = analyzeRigorPolicies(policySource);
  if (validation.errors.length) throw new Error(`POLICY_SOURCE_INVALID:${validation.errors.join(',')}`);
  if (policySource.policies.length !== 1 || !Array.isArray(clientsSource)) throw new Error('SOURCE_CARDINALITY_INVALID');

  const policy = policySource.policies[0];
  if (policy.version !== 1) throw new Error('LEGACY_VERSION_HISTORY_INCOMPLETE');
  const companies = clientsSource.filter(company => company?.tenantId === policy.tenantId && company?.id === policy.companyId);
  if (companies.length !== 1) throw new Error('COMPANY_REFERENCE_AMBIGUOUS');
  const company = companies[0];
  if (company.status !== 'active' || !Array.isArray(company.units)) throw new Error('COMPANY_SCOPE_INACTIVE');
  const units = company.units.filter(unit => unit?.id === policy.unitId);
  if (units.length !== 1) throw new Error('UNIT_REFERENCE_AMBIGUOUS');

  const snapshot = structuredClone(policy);
  const sourceDigest = createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
  return {
    tenantId: policy.tenantId,
    companyId: policy.companyId,
    unitId: policy.unitId,
    expectedVersion: 0,
    nextVersion: 1,
    validFrom: policy.validFrom,
    defaultLevel: policy.defaultLevel,
    levels: structuredClone(policy.levels),
    reviewerClaim: policy.reviewer,
    sourceDigest,
    legacySnapshot: snapshot,
    scope: { companyActive: true, unitCompanyId: policy.companyId },
  };
}

export function digestLegacySnapshot(snapshot) {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}
