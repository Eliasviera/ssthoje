import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Prova apenas em PostgreSQL descartável; não lê env, volume ou banco do aplicativo.
const name = `sst-manager-grants-${randomUUID().replaceAll('-', '')}`;
const password = randomBytes(24).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 30000 }).trim();
let pool, started = false;
const tenant = 'tenant-a';
const admin = 'admin-ficticio';
const manager = 'gestor-ficticio';
const scopeA = { company: 'cliente-a', unit: 'unidade-a' };
const scopeB = { company: 'cliente-b', unit: 'unidade-b' };

async function asApp(userId, tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE manager_grant_candidate_app');
    await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [userId,tenantId]);
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

try {
  docker(['run','--rm','-d','--name',name,'-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=sst_hoje_dev','-p','127.0.0.1::5432','postgres:17-alpine']);
  started = true;
  const port = Number(docker(['port',name,'5432/tcp']).split(/\r?\n/)[0].split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password, database: 'sst_hoje_dev', max: 6, connectionTimeoutMillis: 1000 });
  for (let attempt=0; ; attempt++) {
    try { await pool.query('SELECT 1'); break; }
    catch { if(attempt===39) throw new Error('postgres-not-ready'); await new Promise(done=>setTimeout(done,500)); }
  }
  await pool.query('CREATE SCHEMA sst');
  await pool.query(await readFile(new URL('../db/migrations/0001_tenant_registry.sql', import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../db/migrations/0004_client_companies.sql', import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../../schemas/manager-grants-candidate.sql', import.meta.url),'utf8'));
  await pool.query("INSERT INTO sst.tenants (id,name) VALUES ($1,'Consultoria fictícia A'),('tenant-b','Consultoria fictícia B')",[tenant]);
  await pool.query("INSERT INTO sst.tenant_memberships (tenant_id,user_id,role,status,display_name) VALUES ($1,$2,'consultoria_admin','active','Concedente fictício'),($1,$3,'cliente','active','Gestor fictício'),($1,'conta-suspensa','cliente','suspended','Conta suspensa'),($1,'conta-falha','cliente','active','Conta de falha'),($1,'admin-suspenso','consultoria_admin','suspended','Admin suspenso'),('tenant-b','gestor-b','cliente','active','Gestor tenant B')",[tenant,admin,manager]);
  await pool.query("INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at) VALUES ($1,$2,'Cliente fictício A','Cliente A','Contato fictício','a@example.test','0000000000','active',now(),now()),($1,$3,'Cliente fictício B','Cliente B','Contato fictício','b@example.test','0000000000','active',now(),now()),($1,'cliente-arquivado','Cliente arquivado','Arquivado','Contato fictício','c@example.test','0000000000','archived',now(),now()),('tenant-b','cliente-b','Cliente B fictício','Cliente B','Contato fictício','b@example.test','0000000000','active',now(),now())",[tenant,scopeA.company,scopeB.company]);
  await pool.query("INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,$2,$3,'00000000000001','Unidade A','São Paulo/SP'),($1,$4,$5,'00000000000002','Unidade B','Campinas/SP'),($1,'unidade-arquivada','cliente-arquivado','00000000000003','Unidade arquivada','Santos/SP'),('tenant-b','unidade-b','cliente-b','00000000000004','Unidade B','Curitiba/PR')",[tenant,scopeA.unit,scopeA.company,scopeB.unit,scopeB.company]);
  await pool.query("INSERT INTO manager_grant_candidate.registrars (tenant_id,user_id,company_id,active) VALUES ($1,$2,$3,true),($1,'admin-suspenso',$3,true),($1,$2,'cliente-arquivado',true)", [tenant,admin,scopeA.company]);

  const grantId = await asApp(admin,tenant,async client => (await client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4) AS id', [manager,scopeA.company,scopeA.unit,'gestor_contrato'])).rows[0].id);
  assert.ok(grantId);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', ['nao-cadastrado',scopeA.company,scopeA.unit,'gestor_contrato'])), /previamente cadastrad/);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [manager,scopeA.company,scopeB.unit,'gestor_contrato'])), /escopo ativo/);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [manager,'cliente-arquivado','unidade-arquivada','gestor_contrato'])), /empresa cliente não está ativa/);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [manager,scopeB.company,scopeB.unit,'gestor_contrato'])), /sem autorização administrativa/);
  await assert.rejects(asApp('admin-suspenso',tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [manager,scopeA.company,scopeA.unit,'gestor_contrato'])), /conta do concedente não está ativa/);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [admin,scopeA.company,scopeA.unit,'dono_cliente'])), /não pode conceder autoridade a si mesmo/);
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', [manager,scopeA.company,scopeA.unit,'gestor_contrato'])), { code: '23505' });
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', ['conta-suspensa',scopeA.company,scopeA.unit,'gestor_contrato'])), /previamente cadastrad/);
  await pool.query('ALTER TABLE manager_grant_candidate.events ADD CONSTRAINT proof_grant_failure CHECK (false) NOT VALID');
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4)', ['conta-falha',scopeA.company,scopeA.unit,'gestor_contrato'])), { code: '23514' });
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_grant_candidate.grants WHERE tenant_id=$1',[tenant])).rows[0].count),1);
  await pool.query('ALTER TABLE manager_grant_candidate.events DROP CONSTRAINT proof_grant_failure');

  const current = await asApp(manager,tenant,async client => (await client.query(
    'SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants);
  assert.equal(current.length,1);
  assert.equal(current[0].membershipId,grantId);
  assert.equal(current[0].companyId,scopeA.company);
  const otherTenantGrants = await asApp('gestor-b','tenant-b',async client => (await client.query(
    'SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants);
  assert.deepEqual(otherTenantGrants,[]);

  // Tabelas não aceitam leitura/escrita direta pelo papel de runtime.
  await assert.rejects(asApp(manager,tenant,client => client.query('SELECT * FROM manager_grant_candidate.grants')), { code: '42501' });
  await assert.rejects(asApp(manager,tenant,client => client.query('DELETE FROM manager_grant_candidate.events')), { code: '42501' });

  // Decisão em andamento bloqueia a revogação; após liberar, ela persiste e remove o grant ativo.
  const holder = await pool.connect();
  const revoker = await pool.connect();
  try {
    await holder.query('BEGIN');
    await holder.query('SET LOCAL ROLE manager_grant_candidate_app');
    await holder.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)",[manager,tenant]);
    const locked = (await holder.query('SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants;
    assert.equal(locked.length,1);
    await revoker.query("SELECT set_config('sst.user_id',$1,false),set_config('sst.tenant_id',$2,false)",[admin,tenant]);
    await revoker.query("SET lock_timeout='200ms'");
    await assert.rejects(revoker.query('SELECT manager_grant_candidate.revoke_manager($1)',[grantId]),{ code: '55P03' });
    await holder.query('ROLLBACK');
  } finally { await holder.query('ROLLBACK'); holder.release(); revoker.release(); }

  await pool.query('ALTER TABLE manager_grant_candidate.events ADD CONSTRAINT proof_revoke_failure CHECK (false) NOT VALID');
  await assert.rejects(asApp(admin,tenant,client => client.query(
    'SELECT manager_grant_candidate.revoke_manager($1)',[grantId])), { code: '23514' });
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_grant_candidate.grants WHERE tenant_id=$1 AND active',[tenant])).rows[0].count),1);
  await pool.query('ALTER TABLE manager_grant_candidate.events DROP CONSTRAINT proof_revoke_failure');
  await asApp(admin,tenant,client => client.query('SELECT manager_grant_candidate.revoke_manager($1)',[grantId]));
  const afterRevoke = await asApp(manager,tenant,async client => (await client.query(
    'SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants);
  assert.deepEqual(afterRevoke,[]);
  const replacementId = await asApp(admin,tenant,async client => (await client.query(
    'SELECT manager_grant_candidate.grant_manager($1,$2,$3,$4) AS id', [manager,scopeA.company,scopeA.unit,'dono_cliente'])).rows[0].id);
  assert.notEqual(replacementId,grantId);
  const replacementAuthority = await asApp(manager,tenant,async client => (await client.query(
    'SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants);
  assert.equal(replacementAuthority[0].role,'dono_cliente');
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_grant_candidate.events WHERE tenant_id=$1',[tenant])).rows[0].count),3);
  assert.equal(Number((await pool.query('SELECT count(*) FROM manager_grant_candidate.grants WHERE tenant_id=$1 AND active',[tenant])).rows[0].count),1);

  const crossTenantGrants = await asApp(manager,'tenant-b',async client => (await client.query(
    'SELECT manager_grant_candidate.lock_current_grants() AS grants')).rows[0].grants);
  assert.deepEqual(crossTenantGrants,[]);
  console.log('Prova PostgreSQL descartável aprovada: principal pré-cadastrado, concedente por empresa, escopo ativo, autoatribuição/duplicidade negadas, grants auditados, acesso direto negado, revogação serializada e histórico preservado.');
} catch(error) {
  const diagnostic = String(error.stderr || error.message || '').replaceAll(password,'[redigido]').replaceAll(name,'[container descartável]');
  console.error(`Prova não concluída (${error.code || error.name}): ${diagnostic.trim()}. Banco ativo não utilizado.`);
  process.exitCode=1;
} finally {
  await pool?.end();
  if(started) docker(['rm','-f',name]);
}
