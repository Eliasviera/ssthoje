import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManagerDecision } from '../src/lib/contract-manager-decision.mjs';
const context = { userId: 'gestor-ficticio', role: 'gestor_contrato', employerCompanyId: 'empresa-a', tenantId: 'tenant-a', scopes: [{ companyId: 'empresa-a', unitId: 'unidade-a' }] };
const analysis = { id: 'analise-a', tenantId: 'tenant-a', companyId: 'empresa-a', unitId: 'unidade-a', scope: 'escopo fictício', fingerprint: 'snapshot-a', policyVersion: 1, analystUserId: 'sst-ficticio', pending: [{ id: 'pgr-a', level: 'authorization' }] };
const command = { analysisId: 'analise-a', fingerprint: 'snapshot-a', decision: 'require_correction_before_entry', justification: 'Justificativa fictícia do gestor.' };
test('exige gestor próprio, vínculo e separação da análise', () => {
  for (const change of [{ role: 'consultoria_admin' }, { role: 'sst_tst' }, { employerCompanyId: 'outro-cliente' }, { tenantId: 'tenant-b' }, { scopes: [] }, { userId: 'sst-ficticio' }]) {
    assert.throws(() => validateManagerDecision({ ...context, ...change }, analysis, command));
  }
});
test('recusa snapshot desatualizado e justificativa ausente', () => {
  assert.throws(() => validateManagerDecision(context, analysis, { ...command, fingerprint: 'antigo' }));
  assert.throws(() => validateManagerDecision(context, analysis, { ...command, justification: '  ' }));
});
test('bloqueio impede autorização condicionada e permite exigir correção ou devolver para SST', () => {
  const blocked = { ...analysis, pending: [{ id: 'pendencia-a', level: 'block' }] };
  assert.throws(() => validateManagerDecision(context, blocked, { ...command, decision: 'authorize_conditional_entry', correctivePlan: { description: 'Ação fictícia.' } }));
  assert.equal(validateManagerDecision(context, blocked, command).mobilizationStatus, 'blocked');
  assert.equal(validateManagerDecision(context, blocked, { ...command, decision: 'return_to_sst' }).decision, 'return_to_sst');
});
test('preserva análise e associa decisão ao gestor e versão exatos', () => {
  const before = JSON.stringify(analysis);
  const result = validateManagerDecision(context, analysis, { ...command, decision: 'authorize_conditional_entry', correctivePlan: { description: 'Corrigir antes da próxima etapa.' } });
  assert.equal(result.managerUserId, context.userId);
  assert.equal(result.policyVersion, 1);
  assert.equal(result.mobilizationStatus, 'conditional');
  assert.equal(result.pendingRemainsOpen, true);
  assert.equal(result.correctivePlan.description, 'Corrigir antes da próxima etapa.');
  assert.deepEqual(result.pendingIds, ['pgr-a']);
  assert.equal(JSON.stringify(analysis), before);
});

