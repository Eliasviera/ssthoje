import { assertCompleteAnalysisSourceManifest, compileAnalysisSources } from './third-party-analysis-sources.mjs';

// Candidato: metadados de extração devem ser emitidos pelo repositório de servidor.
export function assertTransactionalAnalysisSources(scope, extraction) {
  if (!scope?.tenantId || !scope.companyId || !scope.unitId || !scope.contractorId || !scope.scopeId) {
    throw new Error('Escopo da extração incompleto.');
  }
  if (!extraction?.transactionId || !Array.isArray(extraction.sources)) throw new Error('Extração transacional ausente.');
  const required=['documents','requirements','evaluations','policies','criteria'];
  for (const kind of required) {
    const matches=extraction.sources.filter(source=>source.kind===kind);
    if (matches.length!==1) throw new Error('Fonte obrigatória ausente ou duplicada.');
    const source=matches[0];
    if (source.storage!=='postgres' || source.authoritative!==true || source.locked!==true ||
        source.transactionId!==extraction.transactionId ||
        ['tenantId','companyId','unitId','contractorId','scopeId'].some(key=>source[key]!==scope[key])) {
      throw new Error('Fontes incompatíveis: análise exige origem autoritativa no mesmo escopo e transação.');
    }
  }
  if (extraction.sources.length!==required.length) throw new Error('Conjunto de fontes não reconhecido.');
  return true;
}

// Une o gate de origem transacional ao manifesto versionado que será fingerprintado.
// Cada marcador de grupo também precisa carregar id, revisão e digest da extração agregada.
export function compileTransactionalAnalysisManifest(scope, extraction, policyVersion, pending) {
  assertTransactionalAnalysisSources(scope, extraction);
  const policySource = extraction.sources.find(source => source.kind === 'policies');
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1 || policySource.revision !== policyVersion) {
    throw new Error('Versão da política não corresponde à fonte extraída.');
  }
  const dependencies = Object.fromEntries(extraction.sources.map(source => [source.kind, [source]]));
  const manifest = compileAnalysisSources(scope, { ...dependencies, policyVersion, readinessTransactionId: extraction.transactionId }, pending);
  assertCompleteAnalysisSourceManifest(manifest);
  return manifest;
}
