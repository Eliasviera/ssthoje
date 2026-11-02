-- Complemento candidato; somente banco descartável de manager_candidate.
CREATE TABLE manager_candidate.analyst_assignments (
  tenant_id text NOT NULL, user_id text NOT NULL, scope_id text NOT NULL,
  active boolean NOT NULL, actor jsonb NOT NULL,
  PRIMARY KEY (tenant_id,user_id,scope_id)
);
CREATE TABLE manager_candidate.source_scopes (
  tenant_id text NOT NULL, id text NOT NULL, snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE manager_candidate.analysis_publication_keys (
  tenant_id text NOT NULL, scope_id text NOT NULL, fingerprint text NOT NULL,
  analysis_id text NOT NULL,
  PRIMARY KEY (tenant_id,scope_id,fingerprint),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES manager_candidate.analyses(tenant_id,id)
);
CREATE TABLE manager_candidate.analysis_audit (
  tenant_id text NOT NULL, target_id text NOT NULL, actor_user_id text NOT NULL,
  action text NOT NULL CHECK (action='thirdparty.analysis_published'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,target_id),
  FOREIGN KEY (tenant_id,target_id) REFERENCES manager_candidate.analyses(tenant_id,id)
);
ALTER TABLE manager_candidate.analysis_publication_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_candidate.analysis_publication_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_candidate.analysis_publication_keys
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
ALTER TABLE manager_candidate.analysis_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_candidate.analysis_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_candidate.analysis_audit
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true) AND actor_user_id=current_setting('sst.user_id',true));
CREATE FUNCTION manager_candidate.lock_analyst(scope_id_input text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  SELECT actor INTO result FROM manager_candidate.analyst_assignments
    WHERE tenant_id=current_setting('sst.tenant_id',true) AND user_id=current_setting('sst.user_id',true)
      AND scope_id=scope_id_input AND active FOR SHARE;
  RETURN result;
END $$;
CREATE FUNCTION manager_candidate.lock_source(scope_id_input text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  SELECT snapshot INTO result FROM manager_candidate.source_scopes
    WHERE tenant_id=current_setting('sst.tenant_id',true) AND id=scope_id_input FOR SHARE;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION manager_candidate.lock_analyst(text),manager_candidate.lock_source(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manager_candidate.lock_analyst(text),manager_candidate.lock_source(text) TO manager_candidate_app;
GRANT INSERT ON manager_candidate.analyses TO manager_candidate_app;
GRANT SELECT,INSERT ON manager_candidate.analysis_publication_keys,manager_candidate.analysis_audit TO manager_candidate_app;

-- Após haver publicação estruturada, a decisão só lê análise cuja origem continua atual.
CREATE OR REPLACE FUNCTION manager_candidate.lock_analysis(analysis_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE analysis jsonb; source jsonb;
BEGIN
  SELECT snapshot INTO analysis FROM manager_candidate.analyses
    WHERE tenant_id=current_setting('sst.tenant_id',true) AND id=analysis_id FOR SHARE;
  IF analysis IS NULL THEN RETURN NULL; END IF;
  SELECT snapshot INTO source FROM manager_candidate.source_scopes
    WHERE tenant_id=current_setting('sst.tenant_id',true) AND id=analysis->>'scopeId' FOR SHARE;
  IF source IS NULL OR source->>'fingerprint' IS DISTINCT FROM analysis->>'fingerprint'
    OR source->>'policyVersion' IS DISTINCT FROM analysis->>'policyVersion'
    OR source->>'companyId' IS DISTINCT FROM analysis->>'companyId'
    OR source->>'unitId' IS DISTINCT FROM analysis->>'unitId'
    OR source->>'contractorId' IS DISTINCT FROM analysis->>'contractorId'
    OR source->>'scope' IS DISTINCT FROM analysis->>'scope' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM manager_candidate.analysis_publication_keys AS publication
    WHERE publication.tenant_id=current_setting('sst.tenant_id',true) AND publication.analysis_id=$1
      AND publication.scope_id=analysis->>'scopeId' AND publication.fingerprint=analysis->>'fingerprint') THEN
    RETURN NULL;
  END IF;
  RETURN analysis;
END $$;
