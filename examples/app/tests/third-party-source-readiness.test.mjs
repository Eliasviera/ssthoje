import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransactionalAnalysisSources } from '../src/lib/third-party-source-readiness.mjs';
const scope={tenantId:'consultoria',companyId:'cliente',unitId:'unidade',contractorId:'00000000-0000-4000-8000-000000000001',scopeId:'00000000-0000-4000-8000-000000000002'};
const extraction=()=>({transactionId:'tx-servidor',sources:['documents','requirements','evaluations','policies','criteria'].map(kind=>({...scope,kind,transactionId:'tx-servidor',storage:'postgres',authoritative:true,locked:true}))});
test('aceita somente conjunto completo de recortes da mesma transação',()=>{
  assert.equal(assertTransactionalAnalysisSources(scope,extraction()),true);
});
test('JSON ativo ou réplica candidata não servem como fonte autoritativa transacional',()=>{
  for(const changes of [{storage:'json'},{authoritative:false},{locked:false},{transactionId:'outra-tx'}]) {
    const value=extraction();Object.assign(value.sources[0],changes);
    assert.throws(()=>assertTransactionalAnalysisSources(scope,value));
  }
});
test('recusa outra terceira ou unidade mesmo no mesmo tenant',()=>{
  for(const changes of [{contractorId:'00000000-0000-4000-8000-000000000003'},{unitId:'outra'},{tenantId:'outra'}]) {
    const value=extraction();Object.assign(value.sources[0],changes);
    assert.throws(()=>assertTransactionalAnalysisSources(scope,value));
  }
});
test('critérios ausentes ou duplicados impedem publicar',()=>{
  const missing=extraction();missing.sources.pop();
  assert.throws(()=>assertTransactionalAnalysisSources(scope,missing));
  const duplicated=extraction();duplicated.sources.push(duplicated.sources[0]);
  assert.throws(()=>assertTransactionalAnalysisSources(scope,duplicated));
});
