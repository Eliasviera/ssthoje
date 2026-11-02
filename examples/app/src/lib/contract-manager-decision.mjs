// Contrato candidato, desconectado do runtime. Contexto deverá vir do servidor.
// Não cria identidade, vínculo, permissão ou aprovação persistida.
export function validateManagerDecision(context, analysis, command) {
  if (!context || context.role !== 'gestor_contrato' || !context.userId || !context.tenantId) {
    throw new Error('Decisão exclusiva do gestor de contrato autenticado.');
  }
  if (!analysis || context.employerCompanyId !== analysis.companyId || context.tenantId !== analysis.tenantId ||
      !context.scopes?.some(scope => scope.companyId === analysis.companyId && scope.unitId === analysis.unitId)) {
    throw new Error('Gestor sem vínculo com a empresa e unidade da análise.');
  }
  if (!analysis.id || !analysis.scope || !analysis.fingerprint || !analysis.policyVersion ||
      !analysis.analystUserId || context.userId === analysis.analystUserId) {
    throw new Error('Análise incompleta ou ausência de separação entre analista e aprovador.');
  }
  if (!command || command.analysisId !== analysis.id || command.fingerprint !== analysis.fingerprint) {
    throw new Error('Análise alterada. Confira novamente as pendências.');
  }
  if (!['require_correction_before_entry', 'authorize_conditional_entry', 'return_to_sst'].includes(command.decision) ||
      typeof command.justification !== 'string' || !command.justification.trim() || command.justification.length > 1200) {
    throw new Error('Informe decisão e justificativa válidas.');
  }
  if (!Array.isArray(analysis.pending) || !analysis.pending.length || analysis.pending.some(item =>
    !item.id || !['inform', 'authorization', 'block'].includes(item.level))) {
    throw new Error('Pendências da análise inválidas.');
  }
  if (command.decision === 'authorize_conditional_entry') {
    const plan = command.correctivePlan;
    if (analysis.pending.some(item => item.level === 'block')) {
      throw new Error('A política impede autorizar esta pendência.');
    }
    if (!plan || typeof plan.description !== 'string' || !plan.description.trim() || plan.description.length > 1200 ||
        (plan.responsible !== undefined && (typeof plan.responsible !== 'string' || plan.responsible.length > 160)) ||
        (plan.dueOn !== undefined && (typeof plan.dueOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.dueOn) ||
          !Number.isFinite(Date.parse(`${plan.dueOn}T12:00:00Z`)) || new Date(`${plan.dueOn}T12:00:00Z`).toISOString().slice(0, 10) !== plan.dueOn))) {
      throw new Error('A autorização condicionada exige plano de adequação válido; responsável e prazo podem ser informados quando definidos.');
    }
  } else if (command.correctivePlan !== undefined) {
    throw new Error('O plano pós-ingresso só se aplica à autorização condicionada.');
  }
  const correctivePlan = command.decision === 'authorize_conditional_entry' ? Object.freeze({
    description: command.correctivePlan.description.trim(),
    ...(command.correctivePlan.responsible?.trim() ? { responsible: command.correctivePlan.responsible.trim() } : {}),
    ...(command.correctivePlan.dueOn ? { dueOn: command.correctivePlan.dueOn } : {}),
  }) : undefined;
  return Object.freeze({
    analysisId: analysis.id, fingerprint: analysis.fingerprint,
    tenantId: analysis.tenantId, companyId: analysis.companyId, unitId: analysis.unitId,
    scope: analysis.scope, policyVersion: analysis.policyVersion,
    analystUserId: analysis.analystUserId, managerUserId: context.userId,
    decision: command.decision, justification: command.justification.trim(),
    mobilizationStatus: command.decision === 'authorize_conditional_entry' ? 'conditional' : 'blocked',
    pendingRemainsOpen: analysis.pending.length > 0,
    ...(correctivePlan ? { correctivePlan } : {}),
    pendingIds: Object.freeze(analysis.pending.map(item => item.id)),
  });
}
