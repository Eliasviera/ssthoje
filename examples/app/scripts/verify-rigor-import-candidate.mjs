import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { reconcileRigorSources } from '../src/lib/third-party-rigor-reconciliation.mjs';
import { digestLegacySnapshot, prepareLegacyRigorImportCandidate } from '../src/lib/third-party-rigor-import-candidate.mjs';
import { reconcileRigorScopesWithDatabase } from '../src/lib/third-party-rigor-postgres-reconciliation.mjs';

if (process.argv.length !== 2) throw new Error('Somente prova isolada; argumentos não são aceitos.');
const sourcePaths = ['data/third-party-rigor-policies.json', 'data/clients.json', 'data/audit-log.jsonl'].map(path => resolve(path));
const sourceHash = bytes => createHash('sha256').update(bytes).digest('hex');
const name = `sst-rigor-import-${randomUUID().replaceAll('-', '')}`;
const password = randomBytes(24).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim();
let pool;
let started = false;

try {
  const before = [];
  for (const path of sourcePaths) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('SOURCE_INVALID');
    before.push(await readFile(path));
  }
  const [policySource, clientsSource, auditBytes] = before;
  const policyFile = JSON.parse(policySource.toString('utf8'));
  const clients = JSON.parse(clientsSource.toString('utf8'));
  const auditLines = auditBytes.toString('utf8').split(/\r?\n/);
  const reconciliation = reconcileRigorSources(policyFile, clients, auditLines);
  if (reconciliation.errors.length || reconciliation.scopeMatches !== 1 || reconciliation.scopeMismatches !== 0) throw new Error('SOURCE_RECONCILIATION_BLOCKED');
  const candidate = prepareLegacyRigorImportCandidate(policyFile, clients);

  docker(['run', '--rm', '-d', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', 'postgres:17-alpine']);
  started = true;
  const port = Number(docker(['port', name, '5432/tcp']).split(/\r?\n/)[0].split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', max: 2, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; ; attempt += 1) {
    try { await pool.query('SELECT 1'); break; }
    catch { if (attempt === 39) throw new Error('TEMPORARY_DATABASE_NOT_READY'); await new Promise(resolveWait => setTimeout(resolveWait, 500)); }
  }
  await pool.query(await readFile(new URL('../../../schemas/third-party-rigor-candidate.sql', import.meta.url), 'utf8'));
  await pool.query(`CREATE SCHEMA sst;
    CREATE TABLE sst.client_companies(tenant_id text NOT NULL,id text NOT NULL,status text NOT NULL,PRIMARY KEY(tenant_id,id));
    CREATE TABLE sst.client_units(tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,PRIMARY KEY(tenant_id,id));
    CREATE TABLE sst.client_audit_history(tenant_id text NOT NULL,target_id text NOT NULL,action text NOT NULL);
    ALTER TABLE sst.client_companies ENABLE ROW LEVEL SECURITY; ALTER TABLE sst.client_companies FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON sst.client_companies USING(tenant_id=current_setting('sst.tenant_id',true));
    ALTER TABLE sst.client_units ENABLE ROW LEVEL SECURITY; ALTER TABLE sst.client_units FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON sst.client_units USING(tenant_id=current_setting('sst.tenant_id',true));
    ALTER TABLE sst.client_audit_history ENABLE ROW LEVEL SECURITY; ALTER TABLE sst.client_audit_history FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON sst.client_audit_history USING(tenant_id=current_setting('sst.tenant_id',true));
    GRANT USAGE ON SCHEMA sst TO rigor_candidate_app;
    GRANT SELECT ON sst.client_companies,sst.client_units,sst.client_audit_history TO rigor_candidate_app;`);
  await pool.query('INSERT INTO sst.client_companies VALUES ($1,$2,$3)', [candidate.tenantId, candidate.companyId, candidate.scope.companyActive ? 'active' : 'archived']);
  await pool.query('INSERT INTO sst.client_units VALUES ($1,$2,$3)', [candidate.tenantId, candidate.unitId, candidate.scope.unitCompanyId]);
  await pool.query('INSERT INTO rigor_candidate.scopes VALUES ($1,$2,$3,$4,$5)', [candidate.tenantId, candidate.companyId, candidate.unitId, candidate.scope.companyActive, candidate.scope.unitCompanyId]);

  const asApp = async (tenantId, userId, query, values = []) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE rigor_candidate_app');
      await client.query("SELECT set_config('sst.tenant_id',$1,true),set_config('sst.user_id',$2,true)", [tenantId, userId]);
      const result = await query(client, values);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  const scopeCheck = await asApp(candidate.tenantId, 'importador-demo', client => reconcileRigorScopesWithDatabase(client, candidate.tenantId, [{ tenantId: candidate.tenantId, companyId: candidate.companyId, unitId: candidate.unitId }]));
  assert.equal(scopeCheck.scopeMatches, 1);
  assert.equal(scopeCheck.scopeMismatches, 0);

  await pool.query('INSERT INTO rigor_candidate.authorized_attestors VALUES ($1,$2,$3,true)', [candidate.tenantId, candidate.companyId, 'gestor-cliente-demo']);
  const importSql = "SELECT rigor_candidate.import_legacy_unverified($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb)";
  const importValues = [candidate.companyId, candidate.unitId, candidate.expectedVersion, candidate.nextVersion, candidate.validFrom, candidate.defaultLevel, JSON.stringify(candidate.levels), candidate.reviewerClaim, candidate.sourceDigest, JSON.stringify(candidate.legacySnapshot)];
  await asApp(candidate.tenantId, 'importador-demo', (client, values) => client.query(importSql, values), importValues);

  const stored = (await pool.query('SELECT provenance,legacy_metadata,source_digest,created_by FROM rigor_candidate.policies WHERE tenant_id=$1 AND company_id=$2 AND unit_id=$3 AND version=1', [candidate.tenantId, candidate.companyId, candidate.unitId])).rows[0];
  assert.equal(stored.provenance, 'legacy_unverified');
  assert.equal(stored.created_by, 'importador-demo');
  assert.deepEqual(stored.legacy_metadata, candidate.legacySnapshot);
  assert.equal(stored.source_digest, digestLegacySnapshot(stored.legacy_metadata));
  const effectiveQuery = client => client.query('SELECT rigor_candidate.current_effective_policy($1,$2) AS policy', [candidate.companyId, candidate.unitId]);
  assert.equal((await asApp(candidate.tenantId, 'importador-demo', effectiveQuery)).rows[0].policy, null);
  await assert.rejects(asApp(candidate.tenantId, 'analista-demo', (client) => client.query('SELECT rigor_candidate.attest_legacy_policy($1,$2,$3,$4)', [candidate.companyId, candidate.unitId, 1, candidate.sourceDigest])), { code: '42501' });
  await assert.rejects(asApp(candidate.tenantId, 'gestor-cliente-demo', client => client.query('SELECT rigor_candidate.attest_legacy_policy($1,$2,$3,$4)', [candidate.companyId, candidate.unitId, 1, '0'.repeat(64)])), { code: '40001' });
  await asApp(candidate.tenantId, 'gestor-cliente-demo', client => client.query('SELECT rigor_candidate.attest_legacy_policy($1,$2,$3,$4)', [candidate.companyId, candidate.unitId, 1, candidate.sourceDigest]));
  assert.equal((await asApp(candidate.tenantId, 'gestor-cliente-demo', effectiveQuery)).rows[0].policy.provenance, 'legacy_unverified');

  const after = await Promise.all(sourcePaths.map(path => readFile(path)));
  const policySourceStable = sourceHash(before[0]) === sourceHash(after[0]);
  const scopeSourceStable = sourceHash(before[1]) === sourceHash(after[1]);
  const auditSourceStable = sourceHash(before[2]) === sourceHash(after[2]);
  const afterReconciliation = reconcileRigorSources(
    JSON.parse(after[0].toString('utf8')),
    JSON.parse(after[1].toString('utf8')),
    after[2].toString('utf8').split(/\r?\n/),
  );
  const policyAuditHistoryStable = afterReconciliation.errors.length === 0 && afterReconciliation.policyAuditEvents === reconciliation.policyAuditEvents;
  assert.equal(policySourceStable && scopeSourceStable && policyAuditHistoryStable, true);
  console.log(JSON.stringify({ status: 'isolated_import_proof_passed', policyCount: 1, isolatedSeededScopeMatches: scopeCheck.scopeMatches, provenance: stored.provenance, legacySnapshotPreserved: true, syntheticImporter: true, syntheticAttestor: true, policySourceStable, scopeSourceStable, policyAuditHistoryStable, auditSourceStable, activeDatabaseUsed: false, runtimeChanged: false }, null, 2));
} catch (error) {
  const detail = String(error.stack || error.message || 'error').replaceAll(password, '[redacted]');
  console.error(`Prova de importação isolada não concluída (${error.code || error.name}); ${detail}. Banco ativo não utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) docker(['rm', '-f', name]);
}
