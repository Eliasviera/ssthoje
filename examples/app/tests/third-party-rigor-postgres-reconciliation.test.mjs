import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRigorScopesWithDatabase } from '../src/lib/third-party-rigor-postgres-reconciliation.mjs';

test('consulta somente IDs/status no tenant da sessão e resume escopo sem dados de contato',async()=>{
  let captured;
  const client={query:async(sql,params)=>{captured={sql,params};return {rows:[{status:'active',unit_matches:true,company_audit_count:2}]};}};
  const result=await reconcileRigorScopesWithDatabase(client,'tenant-a',[{tenantId:'tenant-a',companyId:'company-a',unitId:'unit-a'},{tenantId:'tenant-b',companyId:'company-b',unitId:'unit-b'}]);
  assert.deepEqual(captured.params,['tenant-a',['company-a'],['unit-a']]);
  assert.match(captured.sql,/BEGIN|client_companies/);assert.doesNotMatch(captured.sql,/contact_email|contact_phone|legal_name/);
  assert.equal(result.scopeMatches,1);assert.equal(result.companiesWithAudit,1);assert.equal(result.policyHistoryAvailable,false);assert.equal(result.readyForImport,false);
});
test('escopo ausente ou arquivado bloqueia a reconciliação',async()=>{
  const client={query:async()=>({rows:[{status:'archived',unit_matches:false,company_audit_count:0}]})};
  const result=await reconcileRigorScopesWithDatabase(client,'tenant-a',[{tenantId:'tenant-a',companyId:'c',unitId:'u'}]);
  assert.equal(result.scopeMismatches,1);assert.deepEqual(result.errors,['POLICY_SCOPE_REFERENCE_MISMATCH']);
});
test('não consulta quando a origem não contém política do tenant autenticado',async()=>{
  let called=false;const client={query:async()=>{called=true;return {rows:[]};}};
  const result=await reconcileRigorScopesWithDatabase(client,'tenant-a',[{tenantId:'tenant-b',companyId:'c',unitId:'u'}]);
  assert.equal(called,false);assert.equal(result.policyCount,0);assert.equal(result.readyForImport,false);
});
