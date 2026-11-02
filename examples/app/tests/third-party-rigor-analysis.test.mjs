import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRigorPolicies } from '../src/lib/third-party-rigor-analysis.mjs';
const policy={tenantId:'consultoria',companyId:'cliente',unitId:'unidade',version:1,validFrom:'2026-10-18',reviewer:'Revisor fictício',defaultLevel:'authorization',levels:{PGR:'block'}};
test('política válida continua sem autorização de importação',()=>{
  const result=analyzeRigorPolicies({policies:[policy]});assert.deepEqual(result.errors,[]);assert.equal(result.readyForImport,false);
});
test('metadados históricos ausentes geram avisos sem inferir autor',()=>{
  const result=analyzeRigorPolicies({policies:[policy]});assert.ok(result.warnings.includes('MISSING_ACTOR'));assert.equal(policy.createdBy,undefined);
});
test('recusa data impossível, versão zero, duplicidade e rigor desconhecido',()=>{
  for(const change of [{validFrom:'2026-02-30'},{version:0},{defaultLevel:'liberar'},{levels:{PGR:'qualquer'}}])assert.ok(analyzeRigorPolicies({policies:[{...policy,...change}]}).errors.length);
  assert.ok(analyzeRigorPolicies({policies:[policy,policy]}).errors.includes('DUPLICATE_ACTIVE_SCOPE'));
});
test('campo inesperado bloqueia sem expor conteúdo',()=>{
  const result=analyzeRigorPolicies({policies:[{...policy,secret:'nao-exibir'}]});
  assert.ok(result.errors.includes('UNKNOWN_FIELD'));assert.equal(JSON.stringify(result).includes('nao-exibir'),false);
});
