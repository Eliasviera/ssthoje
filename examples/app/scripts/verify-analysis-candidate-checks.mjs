import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analysisCandidateRepository } from '../src/lib/third-party-analysis-postgres-candidate.mjs';
import { publishThirdPartyAnalysis } from '../src/lib/third-party-analysis-publication.mjs';
import { managerCandidateRepository } from '../src/lib/contract-manager-postgres-candidate.mjs';
import { recordManagerDecision } from '../src/lib/contract-manager-workflow.mjs';
import { compileTransactionalAnalysisManifest } from '../src/lib/third-party-source-readiness.mjs';

export async function verifyAnalysisCandidate(pool) {
  await pool.query(await readFile(new URL('../../../schemas/third-party-analysis-candidate.sql',import.meta.url),'utf8'));
  const identity={userId:'tst-ficticio',tenantId:'tenant-a'};
  const scope={scopeId:'00000000-0000-4000-8000-000000000002',tenantId:'tenant-a',companyId:'empresa',unitId:'unidade',contractorId:'00000000-0000-4000-8000-000000000001',scope:'serviço fictício'};
  const kinds=['documents','requirements','evaluations','policies','criteria'];
  const extraction={transactionId:'tx-ficticia',sources:kinds.map((kind,index)=>({
    ...scope,kind,id:`fonte-${kind}`,revision:1,digest:String(index+1).repeat(64),
    transactionId:'tx-ficticia',storage:'postgres',authoritative:true,locked:true,
  }))};
  const pending=[{id:'pgr',level:'authorization'}];
  const manifest=compileTransactionalAnalysisManifest(scope,extraction,1,pending);
  const source={...scope,extraction,policyVersion:1,pending,fingerprint:manifest.fingerprint};
  const actor={...identity,role:'sst_tst',affiliation:'consultancy',assignments:[manifest]};
  await pool.query('INSERT INTO manager_candidate.analyst_assignments VALUES ($1,$2,$3,true,$4)',[identity.tenantId,identity.userId,source.scopeId,actor]);
  await pool.query('INSERT INTO manager_candidate.source_scopes VALUES ($1,$2,$3)',[identity.tenantId,source.scopeId,source]);
  const repository=analysisCandidateRepository(pool);
  const command={scopeId:source.scopeId,expectedFingerprint:manifest.fingerprint,notes:'Análise fictícia.'};
  await assert.rejects(publishThirdPartyAnalysis(repository,{...identity,tenantId:'tenant-b'},command));
  await assert.rejects(publishThirdPartyAnalysis(repository,identity,{...command,expectedFingerprint:'antigo'}));
  await pool.query('ALTER TABLE manager_candidate.analysis_audit ADD CONSTRAINT proof_failure CHECK(false)');
  await assert.rejects(publishThirdPartyAnalysis(repository,identity,command),{code:'23514'});
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.analysis_publication_keys')).rows[0].count),0);
  await pool.query('ALTER TABLE manager_candidate.analysis_audit DROP CONSTRAINT proof_failure');
  const outcomes=await Promise.allSettled([publishThirdPartyAnalysis(repository,identity,command),publishThirdPartyAnalysis(repository,identity,command)]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const first=outcomes.find(result=>result.status==='fulfilled').value;
  const manager={userId:'gestor-da-analise',tenantId:identity.tenantId};
  await pool.query('INSERT INTO manager_candidate.memberships (tenant_id,user_id,active,employer_company_id,scopes) VALUES ($1,$2,true,$3,$4)',[manager.tenantId,manager.userId,source.companyId,JSON.stringify([{companyId:source.companyId,unitId:source.unitId}])]);
  const managerRepository=managerCandidateRepository(pool);
  const managerCommand={analysisId:first.id,fingerprint:first.fingerprint,decision:'return_to_sst',justification:'Revisão fictícia do gestor do cliente.'};
  await recordManagerDecision(managerRepository,manager,managerCommand);
  for (const group of kinds) {
    const changed=structuredClone(extraction);
    const sourceChanged=changed.sources.find(item=>item.kind===group);
    sourceChanged.revision++;
    const revisedManifest=compileTransactionalAnalysisManifest(scope,changed,group==='policies'?sourceChanged.revision:1,pending);
    const revised={...source,extraction:changed,policyVersion:group==='policies'?sourceChanged.revision:1,fingerprint:revisedManifest.fingerprint};
    assert.notEqual(revised.fingerprint,manifest.fingerprint);
    await pool.query('UPDATE manager_candidate.source_scopes SET snapshot=$1',[revised]);
    await assert.rejects(recordManagerDecision(managerRepository,manager,{...managerCommand,decision:'return_to_sst'}),/Análise indisponível ou desatualizada/);
    // Cada dependência é exercitada separadamente a partir da mesma origem.
    await pool.query('UPDATE manager_candidate.source_scopes SET snapshot=$1',[source]);
  }
  const updatedExtraction=structuredClone(extraction);
  updatedExtraction.sources.find(item=>item.kind==='policies').revision=2;
  const updatedManifest=compileTransactionalAnalysisManifest(scope,updatedExtraction,2,pending);
  const updated={...source,extraction:updatedExtraction,policyVersion:2,fingerprint:updatedManifest.fingerprint};
  await pool.query('UPDATE manager_candidate.source_scopes SET snapshot=$1',[updated]);
  // Mudança da fonte invalida decisão nova sobre a análise antiga, sem apagar histórico.
  await assert.rejects(recordManagerDecision(managerRepository,manager,{...managerCommand,decision:'return_to_sst'}),/Análise indisponível ou desatualizada/);
  const second=await publishThirdPartyAnalysis(repository,identity,{...command,expectedFingerprint:updatedManifest.fingerprint});
  assert.notEqual(second.id,first.id);
  await recordManagerDecision(managerRepository,manager,{...managerCommand,analysisId:second.id,fingerprint:second.fingerprint});
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.decisions WHERE manager_user_id=$1',[manager.userId])).rows[0].count),2);
  assert.deepEqual((await pool.query('SELECT snapshot FROM manager_candidate.analyses WHERE id=$1',[first.id])).rows[0].snapshot,first);
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.analysis_audit')).rows[0].count),2);
  await pool.query('UPDATE manager_candidate.analyst_assignments SET active=false');
  await assert.rejects(publishThirdPartyAnalysis(repository,identity,{...command,expectedFingerprint:updated.fingerprint}));
  console.log('Publicação de análise isolada aprovada: atribuição, tenant, conflito, rollback, concorrência e revisão anterior preservada.');
}
