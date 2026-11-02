import { validateManagerDecision } from './contract-manager-decision.mjs';

// Candidato sem adaptador: transaction deve garantir rollback, locks e commit atômico.
// identity deve ser derivada da sessão no servidor; nunca de campos do formulário.
export async function recordManagerDecision(repository, identity, command) {
  if (!identity?.userId || !identity?.tenantId) throw new Error('Sessão autenticada obrigatória.');
  return repository.transaction(identity, async transaction => {
    // Vínculo e análise são relidos sob lock para impedir revogação/edição concorrente.
    const context = await transaction.lockManagerMembership(identity);
    if (!context || context.userId !== identity.userId || context.tenantId !== identity.tenantId) {
      throw new Error('Vínculo autenticado indisponível.');
    }
    const analysis = await transaction.lockCurrentAnalysis(identity.tenantId, command.analysisId);
    if (!analysis) throw new Error('Análise indisponível ou desatualizada. Refaça a conferência.');
    const decision = validateManagerDecision(context, analysis, command);
    const saved = await transaction.insertDecision(decision);
    await transaction.insertAudit({
      action: 'thirdparty.manager_decision_recorded', targetId: saved.id,
      tenantId: identity.tenantId, actorUserId: identity.userId,
      analysisId: decision.analysisId, decision: decision.decision,
    });
    return saved;
  });
}
