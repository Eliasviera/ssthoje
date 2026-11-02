import { randomUUID } from 'node:crypto';
// Fonte candidata é snapshot de servidor sob lock, não compilação dos domínios ativos.
export function analysisCandidateRepository(pool) {
  return { async transaction(identity, operation) {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE manager_candidate_app');
      await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)",[identity.userId,identity.tenantId]);
      const result=await operation({
        async lockAnalystAssignment(_identity,scopeId) {
          return (await client.query('SELECT manager_candidate.lock_analyst($1) AS value',[scopeId])).rows[0].value;
        },
        async lockAndCompileScope(tenantId,scopeId) {
          if(tenantId!==identity.tenantId)throw new Error('Tenant divergente.');
          return (await client.query('SELECT manager_candidate.lock_source($1) AS value',[scopeId])).rows[0].value;
        },
        async insertAnalysis(value) {
          const id=randomUUID();
          const saved={...value,id,publishedAt:new Date().toISOString()};
          await client.query('INSERT INTO manager_candidate.analyses VALUES ($1,$2,$3)',[identity.tenantId,id,saved]);
          await client.query('INSERT INTO manager_candidate.analysis_publication_keys VALUES ($1,$2,$3,$4)',[identity.tenantId,value.scopeId,value.fingerprint,id]);
          return saved;
        },
        async insertAudit(value) {
          await client.query('INSERT INTO manager_candidate.analysis_audit (tenant_id,target_id,actor_user_id,action) VALUES ($1,$2,$3,$4)',[identity.tenantId,value.targetId,identity.userId,value.action]);
        },
      });
      await client.query('COMMIT');return result;
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }};
}
