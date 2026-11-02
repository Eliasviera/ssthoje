// Candidato: vínculos devem ser carregados pelo servidor, não pelo formulário.
export function validateThirdPartyAnalyst(actor, target) {
  if (!actor?.userId || actor.role !== 'sst_tst' || !target?.tenantId ||
      !target.companyId || !target.unitId || !target.contractorId || actor.tenantId !== target.tenantId) {
    throw new Error('Analista ou escopo não autorizado.');
  }
  if (!['client', 'consultancy'].includes(actor.affiliation)) {
    throw new Error('A análise pertence ao TST do cliente ou à consultoria atribuída.');
  }
  if (actor.affiliation === 'client' && actor.employerCompanyId !== target.companyId) {
    throw new Error('O TST não pertence à empresa cliente deste escopo.');
  }
  if (!actor.assignments?.some(assignment => assignment.companyId === target.companyId &&
      assignment.unitId === target.unitId && assignment.contractorId === target.contractorId)) {
    throw new Error('Escopo de análise não atribuído ao profissional.');
  }
  return Object.freeze({ analystUserId: actor.userId, affiliation: actor.affiliation,
    tenantId: target.tenantId, companyId: target.companyId, unitId: target.unitId,
    contractorId: target.contractorId });
}
