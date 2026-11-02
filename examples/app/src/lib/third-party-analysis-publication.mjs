import { validateThirdPartyAnalyst } from './third-party-analyst-assignment.mjs';
import { compileTransactionalAnalysisManifest } from './third-party-source-readiness.mjs';

// Candidato sem adaptador. identity vem da sessão; conteúdo documental vem do servidor.
export async function publishThirdPartyAnalysis(repository, identity, command) {
  if (!identity?.userId || !identity?.tenantId) throw new Error('Sessão autenticada obrigatória.');
  if (!command?.scopeId || !command.expectedFingerprint || typeof command.notes !== 'string' ||
      !command.notes.trim() || command.notes.length > 1200) throw new Error('Informe escopo, versão e justificativa.');
  return repository.transaction(identity, async transaction => {
    const actor = await transaction.lockAnalystAssignment(identity, command.scopeId);
    if (!actor || actor.userId !== identity.userId || actor.tenantId !== identity.tenantId) {
      throw new Error('Atribuição autenticada indisponível.');
    }
    // O repositório deve bloquear e extrair as cinco fontes autoritativas na mesma transação.
    const source = await transaction.lockAndCompileScope(identity.tenantId, command.scopeId);
    if (!source || source.scopeId !== command.scopeId || source.tenantId !== identity.tenantId ||
        !Number.isInteger(source.policyVersion) || source.policyVersion < 1 || !source.scope?.trim() ||
        !Array.isArray(source.pending)) {
      throw new Error('Fontes alteradas ou incompletas. Refaça a conferência.');
    }
    const scope = Object.freeze({
      tenantId: source.tenantId, companyId: source.companyId, unitId: source.unitId,
      contractorId: source.contractorId, scopeId: source.scopeId, scope: source.scope,
    });
    // A impressão digital é sempre recalculada a partir da extração bloqueada pelo servidor;
    // nunca se aceita um fingerprint fornecido pelo repositório ou pelo formulário.
    const manifest = compileTransactionalAnalysisManifest(scope, source.extraction, source.policyVersion, source.pending);
    if (manifest.fingerprint !== command.expectedFingerprint) {
      throw new Error('Fontes alteradas ou incompletas. Refaça a conferência.');
    }
    const assignment = validateThirdPartyAnalyst(actor, manifest);
    const saved = await transaction.insertAnalysis({ ...manifest,
      analystUserId: identity.userId, analystAffiliation: assignment.affiliation,
      notes: command.notes.trim(),
    });
    await transaction.insertAudit({ action: 'thirdparty.analysis_published', targetId: saved.id,
      tenantId: identity.tenantId, actorUserId: identity.userId, scopeId: source.scopeId });
    return saved;
  });
}
