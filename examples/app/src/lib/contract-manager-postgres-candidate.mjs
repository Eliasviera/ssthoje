import { randomUUID } from 'node:crypto';

// Somente schema candidato em banco descartável. Não ligado ao pool do aplicativo.
export function managerCandidateRepository(pool) {
  return { async transaction(identity, operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE manager_candidate_app');
      await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [identity.userId, identity.tenantId]);
      const result = await operation({
        async lockManagerMembership() {
          return (await client.query('SELECT manager_candidate.lock_membership() AS value')).rows[0].value;
        },
        async lockCurrentAnalysis(tenantId, analysisId) {
          if (tenantId !== identity.tenantId) throw new Error('Tenant divergente.');
          return (await client.query('SELECT manager_candidate.lock_analysis($1) AS value', [analysisId])).rows[0].value;
        },
        async insertDecision(value) {
          const id = randomUUID();
          await client.query('INSERT INTO manager_candidate.decisions (tenant_id,id,analysis_id,manager_user_id,fingerprint,snapshot) VALUES ($1,$2,$3,$4,$5,$6)',
            [identity.tenantId,id,value.analysisId,identity.userId,value.fingerprint,value]);
          return { ...value, id };
        },
        async insertAudit(value) {
          await client.query('INSERT INTO manager_candidate.audit (tenant_id,target_id,actor_user_id,action,snapshot) VALUES ($1,$2,$3,$4,$5)',
            [identity.tenantId,value.targetId,identity.userId,value.action,value]);
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } };
}
