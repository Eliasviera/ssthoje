-- Candidato exclusivo para prova descartável; não é migration do aplicativo.
CREATE SCHEMA manager_candidate;
CREATE ROLE manager_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE manager_candidate.memberships (
  tenant_id text NOT NULL, user_id text NOT NULL, active boolean NOT NULL, employer_company_id text NOT NULL,
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE manager_candidate.analyses (
  tenant_id text NOT NULL, id text NOT NULL, snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE manager_candidate.decisions (
  tenant_id text NOT NULL, id uuid NOT NULL, analysis_id text NOT NULL,
  manager_user_id text NOT NULL, fingerprint text NOT NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,analysis_id,fingerprint),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES manager_candidate.analyses(tenant_id,id)
);
CREATE TABLE manager_candidate.audit (
  tenant_id text NOT NULL, target_id uuid NOT NULL, actor_user_id text NOT NULL,
  action text NOT NULL CHECK (action = 'thirdparty.manager_decision_recorded'),
  snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,target_id),
  FOREIGN KEY (tenant_id,target_id) REFERENCES manager_candidate.decisions(tenant_id,id)
);
ALTER TABLE manager_candidate.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_candidate.analyses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_candidate.analyses
  USING (tenant_id = current_setting('sst.tenant_id',true));
ALTER TABLE manager_candidate.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_candidate.decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_candidate.decisions
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true) AND manager_user_id = current_setting('sst.user_id',true));
ALTER TABLE manager_candidate.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_candidate.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_candidate.audit
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true) AND actor_user_id = current_setting('sst.user_id',true));

-- Funções com escopo explícito: runtime não recebe UPDATE nos vínculos/análises.
CREATE FUNCTION manager_candidate.lock_membership() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE entry manager_candidate.memberships%ROWTYPE;
BEGIN
  SELECT * INTO entry FROM manager_candidate.memberships
   WHERE tenant_id = current_setting('sst.tenant_id',true)
     AND user_id = current_setting('sst.user_id',true) AND active FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('userId',entry.user_id,'tenantId',entry.tenant_id,
    'role','gestor_contrato','employerCompanyId',entry.employer_company_id,'scopes',entry.scopes);
END $$;
CREATE FUNCTION manager_candidate.lock_analysis(analysis_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  SELECT snapshot INTO result FROM manager_candidate.analyses
    WHERE tenant_id = current_setting('sst.tenant_id',true) AND id = analysis_id FOR SHARE;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION manager_candidate.lock_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION manager_candidate.lock_analysis(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA manager_candidate TO manager_candidate_app;
GRANT EXECUTE ON FUNCTION manager_candidate.lock_membership(), manager_candidate.lock_analysis(text) TO manager_candidate_app;
GRANT SELECT ON manager_candidate.analyses TO manager_candidate_app;
GRANT SELECT,INSERT ON manager_candidate.decisions,manager_candidate.audit TO manager_candidate_app;
