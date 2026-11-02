import test from 'node:test';
import assert from 'node:assert/strict';
import { validateThirdPartyAnalyst } from '../src/lib/third-party-analyst-assignment.mjs';
const target = { tenantId: 'consultoria', companyId: 'cliente', unitId: 'unidade', contractorId: '00000000-0000-4000-8000-000000000001' };
const actor = { userId: 'tst', role: 'sst_tst', tenantId: 'consultoria', affiliation: 'client', employerCompanyId: 'cliente', assignments: [target] };
test('TST do cliente pode analisar a terceira atribuída à própria empresa', () => {
  assert.equal(validateThirdPartyAnalyst(actor,target).affiliation,'client');
});
test('consultoria atribuída analisa sem exigir TST próprio do cliente', () => {
  assert.equal(validateThirdPartyAnalyst({...actor,affiliation:'consultancy',employerCompanyId:undefined},target).affiliation,'consultancy');
});
test('nega terceiro, gestor, outro tenant, cliente ou escopo não atribuído', () => {
  for (const change of [{affiliation:'contractor'},{role:'gestor_contrato'},{tenantId:'outra'},
    {employerCompanyId:'outro-cliente'},{assignments:[]},
    {assignments:[{...target,contractorId:'00000000-0000-4000-8000-000000000002'}]},
    {assignments:[{...target,unitId:'outra-unidade'}]}]) {
    assert.throws(()=>validateThirdPartyAnalyst({...actor,...change},target));
  }
});
