import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { managerCandidateRepository } from '../src/lib/contract-manager-postgres-candidate.mjs';
import { recordManagerDecision } from '../src/lib/contract-manager-workflow.mjs';
import { verifyAnalysisCandidate } from './verify-analysis-candidate-checks.mjs';

// Não lê .env nem usa endereço/volume do banco ativo.
const name = `sst-manager-proof-${randomUUID().replaceAll('-', '')}`;
const password = randomBytes(24).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 30000 }).trim();
let pool, started = false;
const identity = { userId: 'gestor-ficticio', tenantId: 'tenant-a' };
const analysis = { id: 'analise-a', tenantId: 'tenant-a', companyId: 'empresa', unitId: 'unidade', scope: 'teste fictício', fingerprint: 'a'.repeat(64), policyVersion: 1, analystUserId: 'sst-ficticio', pending: [{ id: 'pgr', level: 'authorization' }] };
const command = { analysisId: analysis.id, fingerprint: analysis.fingerprint, decision: 'return_to_sst', justification: 'Justificativa fictícia.' };
try {
  docker(['run','--rm','-d','--name',name,'-e',`POSTGRES_PASSWORD=${password}`,'-p','127.0.0.1::5432','postgres:17-alpine']);
  started = true;
  const port = Number(docker(['port',name,'5432/tcp']).split(/\r?\n/)[0].split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', max: 4, connectionTimeoutMillis: 1000 });
  for (let attempt=0; ; attempt++) {
    try { await pool.query('SELECT 1'); break; } catch { if(attempt===39) throw new Error('not-ready'); await new Promise(done=>setTimeout(done,500)); }
  }
  await pool.query(await readFile(new URL('../../../schemas/contract-manager-candidate.sql', import.meta.url),'utf8'));
  await pool.query("INSERT INTO manager_candidate.memberships (tenant_id,user_id,active,employer_company_id,scopes) VALUES ($1,$2,true,'empresa',$3)", [identity.tenantId,identity.userId,JSON.stringify([{companyId:'empresa',unitId:'unidade'}])]);
  await pool.query('INSERT INTO manager_candidate.analyses VALUES ($1,$2,$3)', [identity.tenantId,analysis.id,analysis]);
  const repository = managerCandidateRepository(pool);
  await assert.rejects(recordManagerDecision(repository,{...identity,userId:'sem-vinculo'},command));
  await assert.rejects(recordManagerDecision(repository,{...identity,tenantId:'tenant-b'},command));
  await assert.rejects(recordManagerDecision(repository,identity,{...command,fingerprint:'antigo'}));
  // Falha real da restrição de auditoria deve reverter a decisão já inserida.
  await pool.query("ALTER TABLE manager_candidate.audit ADD CONSTRAINT proof_failure CHECK (false)");
  await assert.rejects(recordManagerDecision(repository,identity,command), {code:'23514'});
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.decisions')).rows[0].count),0);
  await pool.query('ALTER TABLE manager_candidate.audit DROP CONSTRAINT proof_failure');
  // Concorrência: exatamente um commit para o mesmo snapshot; repetição é recusada.
  const outcomes = await Promise.allSettled([recordManagerDecision(repository,identity,command),recordManagerDecision(repository,identity,command)]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.decisions')).rows[0].count),1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.audit')).rows[0].count),1);
  const client=await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE manager_candidate_app');
    assert.equal((await client.query('SELECT * FROM manager_candidate.decisions')).rowCount,0);
    await client.query("SELECT set_config('sst.tenant_id','tenant-b',true)");
    assert.equal((await client.query('SELECT * FROM manager_candidate.decisions')).rowCount,0);
    await assert.rejects(client.query('DELETE FROM manager_candidate.decisions'),{code:'42501'});
    await client.query('ROLLBACK');
  } finally { client.release(); }
  // Revogação e alteração da análise devem esperar os locks da decisão em curso.
  const holder = await pool.connect();
  const updater = await pool.connect();
  try {
    await holder.query('BEGIN');
    await holder.query('SET LOCAL ROLE manager_candidate_app');
    await holder.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [identity.userId,identity.tenantId]);
    assert.ok((await holder.query('SELECT manager_candidate.lock_membership() AS value')).rows[0].value);
    assert.ok((await holder.query('SELECT manager_candidate.lock_analysis($1) AS value',[analysis.id])).rows[0].value);
    await updater.query("SET lock_timeout = '200ms'");
    await assert.rejects(updater.query('UPDATE manager_candidate.memberships SET active=false WHERE tenant_id=$1 AND user_id=$2',[identity.tenantId,identity.userId]),{code:'55P03'});
    await assert.rejects(updater.query('UPDATE manager_candidate.analyses SET snapshot=$1 WHERE tenant_id=$2 AND id=$3',[{...analysis,fingerprint:'novo'},identity.tenantId,analysis.id]),{code:'55P03'});
    await holder.query('ROLLBACK');
    await updater.query('UPDATE manager_candidate.memberships SET active=false WHERE tenant_id=$1 AND user_id=$2',[identity.tenantId,identity.userId]);
  } finally {
    await holder.query('ROLLBACK'); holder.release(); updater.release();
  }
  await assert.rejects(recordManagerDecision(repository,identity,command));
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_candidate.decisions')).rows[0].count),1);
  await verifyAnalysisCandidate(pool);
  console.log('Prova PostgreSQL descartável aprovada: vínculo, tenant, snapshot, rollback de auditoria, concorrência sem duplicação, locks contra revogação/edição e histórico preservado.');
} catch(error) {
  console.error(`Prova não concluída. Banco ativo não utilizado.`,error);
  process.exitCode=1;
} finally {
  await pool?.end();
  if(started) docker(['rm','-f',name]);
}
