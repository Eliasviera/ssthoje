import test from 'node:test';
import assert from 'node:assert/strict';
import { recordManagerDecision } from '../src/lib/contract-manager-workflow.mjs';
const identity = { userId: 'gestor', tenantId: 'tenant-a' };
const context = { ...identity, role: 'gestor_contrato', employerCompanyId: 'empresa', scopes: [{ companyId: 'empresa', unitId: 'unidade' }] };
const analysis = { id: 'analise', tenantId: 'tenant-a', companyId: 'empresa', unitId: 'unidade', scope: 'escopo', fingerprint: 'atual', policyVersion: 1, analystUserId: 'sst', pending: [{ id: 'pendencia', level: 'authorization' }] };
const command = { analysisId: 'analise', fingerprint: 'atual', decision: 'require_correction_before_entry', justification: 'Motivo fictício.' };
function fixture({ membership = context, current = analysis, auditFails = false } = {}) {
  const state = { decisions: [], audit: [], order: [] };
  const repository = { async transaction(_identity, operation) {
    const staged = { decisions: [], audit: [] };
    const result = await operation({
      async lockManagerMembership() { state.order.push('membership'); return membership; },
      async lockCurrentAnalysis() { state.order.push('analysis'); return current; },
      async insertDecision(value) { state.order.push('decision'); const row = { ...value, id: 'decisao' }; staged.decisions.push(row); return row; },
      async insertAudit(value) { state.order.push('audit'); if (auditFails) throw new Error('audit failed'); staged.audit.push(value); },
    });
    state.decisions.push(...staged.decisions); state.audit.push(...staged.audit);
    return result;
  } };
  return { repository, state };
}
test('relê vínculo e análise antes de decisão e auditoria', async () => {
  const { repository, state } = fixture();
  await recordManagerDecision(repository, identity, command);
  assert.deepEqual(state.order, ['membership', 'analysis', 'decision', 'audit']);
  assert.equal(state.audit[0].actorUserId, 'gestor');
  assert.equal(state.decisions.length, 1);
});
test('vínculo revogado ou divergente impede escrita', async () => {
  for (const membership of [null, { ...context, tenantId: 'outro' }, { ...context, userId: 'outro' }]) {
    const { repository, state } = fixture({ membership });
    await assert.rejects(recordManagerDecision(repository, identity, command));
    assert.equal(state.decisions.length, 0);
  }
});
test('snapshot alterado impede escrita', async () => {
  const { repository, state } = fixture({ current: { ...analysis, fingerprint: 'novo' } });
  await assert.rejects(recordManagerDecision(repository, identity, command));
  assert.equal(state.decisions.length, 0);
});
test('erro de auditoria aborta a unidade de trabalho do adaptador simulado', async () => {
  const { repository, state } = fixture({ auditFails: true });
  await assert.rejects(recordManagerDecision(repository, identity, command), /audit failed/);
  assert.equal(state.decisions.length, 0);
  assert.equal(state.audit.length, 0);
});
