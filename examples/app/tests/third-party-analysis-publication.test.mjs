import test from 'node:test';
import assert from 'node:assert/strict';
import { publishThirdPartyAnalysis } from '../src/lib/third-party-analysis-publication.mjs';
import { compileTransactionalAnalysisManifest } from '../src/lib/third-party-source-readiness.mjs';
const identity = { userId:'tst',tenantId:'consultoria' };
const scope = { scopeId:'00000000-0000-4000-8000-000000000002',tenantId:'consultoria',companyId:'cliente',unitId:'unidade',contractorId:'00000000-0000-4000-8000-000000000001',scope:'serviço fictício' };
const kinds = ['documents','requirements','evaluations','policies','criteria'];
const extraction = { transactionId:'tx-ficticia',sources:kinds.map((kind,index)=>({
  ...scope,kind,id:`fonte-${kind}`,revision:1,digest:String(index+1).repeat(64),
  transactionId:'tx-ficticia',storage:'postgres',authoritative:true,locked:true,
})) };
const pending = [{id:'pgr',level:'authorization'}];
const source = { ...scope,extraction,policyVersion:1,pending };
const manifest = compileTransactionalAnalysisManifest(scope,extraction,source.policyVersion,pending);
const actor = {...identity,role:'sst_tst',affiliation:'consultancy',assignments:[source]};
const command = {scopeId:scope.scopeId,expectedFingerprint:manifest.fingerprint,notes:'Conferência fictícia.'};
function fixture({current=source,assigned=actor,auditFails=false}={}) {
  const state={analyses:[],audit:[],order:[]};
  const repository={async transaction(_identity,operation) {
    const staged={analyses:[],audit:[]};
    const result=await operation({
      async lockAnalystAssignment(){state.order.push('assignment');return assigned;},
      async lockAndCompileScope(){state.order.push('sources');return current;},
      async insertAnalysis(value){state.order.push('analysis');const row={...value,id:'analise'};staged.analyses.push(row);return row;},
      async insertAudit(value){state.order.push('audit');if(auditFails)throw new Error('audit failed');staged.audit.push(value);},
    });
    state.analyses.push(...staged.analyses);state.audit.push(...staged.audit);return result;
  }};
  return {repository,state};
}
test('compila fonte no servidor e ignora conteúdo documental enviado pelo formulário',async()=>{
  const {repository,state}=fixture();
  const result=await publishThirdPartyAnalysis(repository,identity,{...command,pending:[],analystUserId:'impostor'});
  assert.deepEqual(result.pending,source.pending);assert.equal(result.analystUserId,'tst');
  assert.deepEqual(state.order,['assignment','sources','analysis','audit']);
});
test('nega atribuição revogada, identidade divergente ou escopo de outra terceira',async()=>{
  for(const assigned of [null,{...actor,userId:'outro'},{...actor,assignments:[{...source,contractorId:'00000000-0000-4000-8000-000000000003'}]}]) {
    const {repository,state}=fixture({assigned});
    await assert.rejects(publishThirdPartyAnalysis(repository,identity,command));assert.equal(state.analyses.length,0);
  }
});
test('mudança de política/documentos e snapshot inválido não publicam',async()=>{
  const changedExtraction={...extraction,sources:extraction.sources.map((row,index)=>index===0?{...row,digest:'f'.repeat(64)}:row)};
  for(const current of [{...source,extraction:changedExtraction},{...source,policyVersion:0},{...source,tenantId:'outro'}]) {
    const {repository,state}=fixture({current});await assert.rejects(publishThirdPartyAnalysis(repository,identity,command));assert.equal(state.analyses.length,0);
  }
});
test('TST do cliente com atribuição válida publica',async()=>{
  const {repository}=fixture({assigned:{...actor,affiliation:'client',employerCompanyId:'cliente'}});
  assert.equal((await publishThirdPartyAnalysis(repository,identity,command)).analystAffiliation,'client');
});
test('falha da auditoria cancela a publicação no repositório simulado',async()=>{
  const {repository,state}=fixture({auditFails:true});await assert.rejects(publishThirdPartyAnalysis(repository,identity,command),/audit failed/);
  assert.equal(state.analyses.length,0);assert.equal(state.audit.length,0);
});
