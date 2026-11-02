import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRigorSources } from '../src/lib/third-party-rigor-reconciliation.mjs';
const policy={tenantId:'t1',companyId:'c1',unitId:'u1'};
test('confere unidade da empresa no mesmo tenant e conta eventos de auditoria relacionados',()=>{
  const result=reconcileRigorSources({policies:[policy]},[{tenantId:'t1',id:'c1',status:'active',units:[{id:'u1'}]}],[JSON.stringify({tenantId:'t1',targetId:'c1',action:'client.updated'}),JSON.stringify({tenantId:'t1',targetId:'c1',action:'thirdparty.rigor_policy.created'})]);
  assert.equal(result.scopeMatches,1);assert.equal(result.companyAuditMatches,1);assert.equal(result.policyAuditEvents,1);assert.equal(result.readyForImport,false);
});
test('não aceita empresa arquivada, unidade alheia ou referência cross-tenant como origem válida',()=>{
  for(const [clients,tenant] of [[[ {tenantId:'t1',id:'c1',status:'archived',units:[{id:'u1'}]} ],'t1'],[[{tenantId:'t1',id:'c1',status:'active',units:[{id:'u2'}]}],'t1'],[[{tenantId:'t2',id:'c1',status:'active',units:[{id:'u1'}]}],'t1']]){
    const result=reconcileRigorSources({policies:[{...policy,tenantId:tenant}]},clients,[]);assert.equal(result.scopeMismatches,1);assert.ok(result.errors.includes('POLICY_SCOPE_REFERENCE_MISMATCH'));
  }
});
test('auditoria malformada bloqueia sem expor conteúdo',()=>{
  const result=reconcileRigorSources({policies:[policy]},[],['conteudo-secreto']);assert.deepEqual(result.errors,['INVALID_AUDIT_LINE']);assert.equal(JSON.stringify(result).includes('conteudo-secreto'),false);
});
