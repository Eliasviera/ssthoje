import { createHash } from 'node:crypto';

export const ANALYSIS_SOURCE_GROUPS = Object.freeze(['documents','requirements','evaluations','policies','criteria']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Manifesto candidato: referências administrativas, sem PDF ou conteúdo clínico.
export function compileAnalysisSources(scope, sources, pending) {
  const keys=['tenantId','companyId','unitId','contractorId','scopeId','scope'];
  if (!scope || keys.some(key=>typeof scope[key]!=='string'||!scope[key].trim())) throw new Error('Escopo incompleto.');
  if (!UUID.test(scope.contractorId) || !UUID.test(scope.scopeId)) throw new Error('Identidade persistente da terceira ou do caso inválida.');
  if (!sources || !Number.isSafeInteger(sources.policyVersion) || sources.policyVersion<1) throw new Error('Versão da política inválida.');
  const dependencies={};
  for (const group of ANALYSIS_SOURCE_GROUPS) {
    // O grupo ausente é representado no manifesto, mas nunca conta como completo.
    const rows=sources[group] ?? [];
    if (!Array.isArray(rows) || (['requirements','policies'].includes(group)&&!rows.length)) throw new Error('Fontes obrigatórias ausentes.');
    const seen=new Set();
    dependencies[group]=rows.map(row=>{
      if (!row || keys.filter(key=>key!=='scope').some(key=>row[key]!==scope[key]) ||
          typeof row.id!=='string'||!row.id.trim()||seen.has(row.id)||
          !Number.isSafeInteger(row.revision)||row.revision<1||!/^[a-f0-9]{64}$/.test(row.digest)) throw new Error('Referência de fonte inválida, duplicada ou fora do escopo.');
      seen.add(row.id);
      return {id:row.id,revision:row.revision,digest:row.digest};
    }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  }
  if (!Array.isArray(pending)) throw new Error('Pendências inválidas.');
  const seenPending=new Set();
  const normalizedPending=pending.map(item=>{
    if (!item||typeof item.id!=='string'||!item.id.trim()||seenPending.has(item.id)||!['inform','authorization','block'].includes(item.level)) throw new Error('Pendências inválidas.');
    seenPending.add(item.id);return {id:item.id,level:item.level};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const completeForTransactionalUse=ANALYSIS_SOURCE_GROUPS.every(group=>dependencies[group].length>0);
  if (sources.readinessTransactionId!==undefined && (typeof sources.readinessTransactionId!=='string'||!sources.readinessTransactionId.trim())) {
    throw new Error('Transação de extração inválida.');
  }
  const manifest={contractVersion:2,completeForTransactionalUse,...Object.fromEntries(keys.map(key=>[key,scope[key]])),policyVersion:sources.policyVersion,...(sources.readinessTransactionId?{readinessTransactionId:sources.readinessTransactionId}:{}),dependencies,pending:normalizedPending};
  const fingerprint=createHash('sha256').update(canonicalJson(manifest)).digest('hex');
  return {...manifest,fingerprint};
}

export function assertCompleteAnalysisSourceManifest(manifest) {
  if (manifest?.contractVersion!==2 || manifest.completeForTransactionalUse!==true ||
      !UUID.test(manifest.contractorId) || !UUID.test(manifest.scopeId) ||
      ANALYSIS_SOURCE_GROUPS.some(group=>!Array.isArray(manifest.dependencies?.[group])||manifest.dependencies[group].length===0)) {
    throw new Error('Manifesto de fontes incompleto para uso transacional.');
  }
  const {fingerprint,...payload}=manifest;
  const expected=createHash('sha256').update(canonicalJson(payload)).digest('hex');
  if (typeof fingerprint!=='string' || fingerprint!==expected) throw new Error('Fingerprint do manifesto inválido.');
  return true;
}
