-- Modelo candidato isolado para prova descartável. Não é migration da aplicação.
CREATE SCHEMA rigor_candidate;
CREATE ROLE rigor_candidate_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE TABLE rigor_candidate.scopes (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  company_active boolean NOT NULL,
  unit_company_id text NOT NULL,
  PRIMARY KEY (tenant_id, company_id, unit_id),
  CHECK (company_id = unit_company_id)
);
CREATE TABLE rigor_candidate.policies (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  valid_from date NOT NULL,
  default_level text NOT NULL CHECK (default_level IN ('inform','authorization','block')),
  levels jsonb NOT NULL CHECK (jsonb_typeof(levels) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL,
  reviewer text NOT NULL,
  provenance text NOT NULL DEFAULT 'new' CHECK (provenance IN ('new','legacy_unverified')),
  legacy_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(legacy_metadata)='object'),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, company_id, unit_id, version),
  FOREIGN KEY (tenant_id, company_id, unit_id)
    REFERENCES rigor_candidate.scopes(tenant_id, company_id, unit_id)
);
CREATE TABLE rigor_candidate.current_policy (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  version integer NOT NULL,
  PRIMARY KEY (tenant_id, company_id, unit_id),
  FOREIGN KEY (tenant_id, company_id, unit_id, version)
    REFERENCES rigor_candidate.policies(tenant_id, company_id, unit_id, version)
);
CREATE TABLE rigor_candidate.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  version integer NOT NULL,
  actor_user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('policy.created','policy.revised','policy.legacy_imported','policy.legacy_attested')),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, company_id, unit_id, version)
    REFERENCES rigor_candidate.policies(tenant_id, company_id, unit_id, version)
);
CREATE TABLE rigor_candidate.authorized_attestors (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  user_id text NOT NULL,
  active boolean NOT NULL,
  PRIMARY KEY (tenant_id,company_id,user_id)
);
CREATE TABLE rigor_candidate.attestations (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  version integer NOT NULL,
  actor_user_id text NOT NULL,
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,company_id,unit_id,version),
  FOREIGN KEY (tenant_id,company_id,unit_id,version)
    REFERENCES rigor_candidate.policies(tenant_id,company_id,unit_id,version)
);
CREATE FUNCTION rigor_candidate.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'versioned policy history is append-only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER policy_history_immutable BEFORE UPDATE OR DELETE ON rigor_candidate.policies
  FOR EACH ROW EXECUTE FUNCTION rigor_candidate.reject_history_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON rigor_candidate.audit
  FOR EACH ROW EXECUTE FUNCTION rigor_candidate.reject_history_mutation();
CREATE TRIGGER attestations_immutable BEFORE UPDATE OR DELETE ON rigor_candidate.attestations
  FOR EACH ROW EXECUTE FUNCTION rigor_candidate.reject_history_mutation();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['scopes','policies','current_policy','audit','authorized_attestors','attestations'] LOOP
    EXECUTE format('ALTER TABLE rigor_candidate.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE rigor_candidate.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON rigor_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''sst.tenant_id'',true))',t);
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA rigor_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA rigor_candidate TO rigor_candidate_app;
GRANT SELECT ON rigor_candidate.scopes, rigor_candidate.policies, rigor_candidate.current_policy, rigor_candidate.audit TO rigor_candidate_app;
GRANT SELECT ON rigor_candidate.authorized_attestors, rigor_candidate.attestations TO rigor_candidate_app;
CREATE FUNCTION rigor_candidate.publish_policy(
  company_input text, unit_input text, expected_version integer, next_version integer,
  valid_from_input date, default_level_input text, levels_input jsonb,
  reviewer_input text, source_digest_input text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,rigor_candidate AS $$
DECLARE tenant text:=current_setting('sst.tenant_id',true);
DECLARE actor text:=current_setting('sst.user_id',true);
DECLARE current_version integer;
DECLARE has_current boolean;
BEGIN
  IF tenant IS NULL OR tenant='' OR actor IS NULL OR actor='' THEN
    RAISE EXCEPTION 'authenticated policy actor required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM rigor_candidate.scopes
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input
      AND company_active AND unit_company_id=company_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active company/unit scope unavailable' USING ERRCODE='P0002'; END IF;
  SELECT version INTO current_version FROM rigor_candidate.current_policy
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input FOR UPDATE;
  has_current:=FOUND;
  current_version:=COALESCE(current_version,0);
  IF current_version IS DISTINCT FROM expected_version OR next_version<>expected_version+1 THEN
    RAISE EXCEPTION 'policy version conflict' USING ERRCODE='40001';
  END IF;
  INSERT INTO rigor_candidate.policies
    (tenant_id,company_id,unit_id,version,valid_from,default_level,levels,created_by,reviewer,provenance,legacy_metadata,source_digest)
    VALUES (tenant,company_input,unit_input,next_version,valid_from_input,default_level_input,levels_input,actor,reviewer_input,'new','{}'::jsonb,source_digest_input);
  INSERT INTO rigor_candidate.current_policy VALUES (tenant,company_input,unit_input,next_version)
    ON CONFLICT (tenant_id,company_id,unit_id) DO UPDATE SET version=EXCLUDED.version;
  INSERT INTO rigor_candidate.audit (tenant_id,company_id,unit_id,version,actor_user_id,action,snapshot_digest)
    VALUES (tenant,company_input,unit_input,next_version,actor,CASE WHEN has_current THEN 'policy.revised' ELSE 'policy.created' END,source_digest_input);
  RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION rigor_candidate.publish_policy(text,text,integer,integer,date,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rigor_candidate.publish_policy(text,text,integer,integer,date,text,jsonb,text,text) TO rigor_candidate_app;

CREATE FUNCTION rigor_candidate.import_legacy_unverified(
  company_input text, unit_input text, expected_version integer, next_version integer,
  valid_from_input date, default_level_input text, levels_input jsonb,
  reviewer_claim_input text, source_digest_input text, legacy_metadata_input jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,rigor_candidate AS $$
DECLARE tenant text:=current_setting('sst.tenant_id',true);
DECLARE actor text:=current_setting('sst.user_id',true);
DECLARE current_version integer;
BEGIN
  IF tenant IS NULL OR tenant='' OR actor IS NULL OR actor='' OR jsonb_typeof(legacy_metadata_input)<>'object' THEN
    RAISE EXCEPTION 'authenticated importer and legacy metadata required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM rigor_candidate.scopes
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input
      AND company_active AND unit_company_id=company_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active company/unit scope unavailable' USING ERRCODE='P0002'; END IF;
  SELECT version INTO current_version FROM rigor_candidate.current_policy
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input FOR UPDATE;
  current_version:=COALESCE(current_version,0);
  IF current_version IS DISTINCT FROM expected_version OR next_version<>expected_version+1 THEN
    RAISE EXCEPTION 'policy version conflict' USING ERRCODE='40001';
  END IF;
  INSERT INTO rigor_candidate.policies
    (tenant_id,company_id,unit_id,version,valid_from,default_level,levels,created_by,reviewer,provenance,legacy_metadata,source_digest)
    VALUES (tenant,company_input,unit_input,next_version,valid_from_input,default_level_input,levels_input,actor,reviewer_claim_input,'legacy_unverified',legacy_metadata_input,source_digest_input);
  INSERT INTO rigor_candidate.current_policy VALUES (tenant,company_input,unit_input,next_version)
    ON CONFLICT (tenant_id,company_id,unit_id) DO UPDATE SET version=EXCLUDED.version;
  INSERT INTO rigor_candidate.audit (tenant_id,company_id,unit_id,version,actor_user_id,action,snapshot_digest)
    VALUES (tenant,company_input,unit_input,next_version,actor,'policy.legacy_imported',source_digest_input);
  RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION rigor_candidate.import_legacy_unverified(text,text,integer,integer,date,text,jsonb,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rigor_candidate.import_legacy_unverified(text,text,integer,integer,date,text,jsonb,text,text,jsonb) TO rigor_candidate_app;

CREATE FUNCTION rigor_candidate.attest_legacy_policy(
  company_input text, unit_input text, expected_version integer, expected_digest text
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,rigor_candidate AS $$
DECLARE tenant text:=current_setting('sst.tenant_id',true);
DECLARE actor text:=current_setting('sst.user_id',true);
DECLARE policy_digest text;
DECLARE policy_provenance text;
DECLARE current_version integer;
DECLARE attestation_time timestamptz;
BEGIN
  IF tenant IS NULL OR tenant='' OR actor IS NULL OR actor='' THEN
    RAISE EXCEPTION 'authenticated attestor required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM rigor_candidate.scopes
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input
      AND company_active AND unit_company_id=company_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active company/unit scope unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM rigor_candidate.authorized_attestors
    WHERE tenant_id=tenant AND company_id=company_input AND user_id=actor AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authorized client attestor required' USING ERRCODE='42501'; END IF;
  SELECT version INTO current_version FROM rigor_candidate.current_policy
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input FOR SHARE;
  IF current_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'policy version conflict' USING ERRCODE='40001';
  END IF;
  SELECT source_digest,provenance INTO policy_digest,policy_provenance FROM rigor_candidate.policies
    WHERE tenant_id=tenant AND company_id=company_input AND unit_id=unit_input AND version=expected_version FOR SHARE;
  IF policy_digest IS DISTINCT FROM expected_digest OR policy_provenance IS DISTINCT FROM 'legacy_unverified' THEN
    RAISE EXCEPTION 'legacy policy snapshot mismatch' USING ERRCODE='40001';
  END IF;
  INSERT INTO rigor_candidate.attestations
    (tenant_id,company_id,unit_id,version,actor_user_id,snapshot_digest)
    VALUES (tenant,company_input,unit_input,expected_version,actor,expected_digest)
  RETURNING attested_at INTO attestation_time;
  INSERT INTO rigor_candidate.audit
    (tenant_id,company_id,unit_id,version,actor_user_id,action,snapshot_digest)
    VALUES (tenant,company_input,unit_input,expected_version,actor,'policy.legacy_attested',expected_digest);
  RETURN attestation_time;
END $$;
REVOKE ALL ON FUNCTION rigor_candidate.attest_legacy_policy(text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rigor_candidate.attest_legacy_policy(text,text,integer,text) TO rigor_candidate_app;

CREATE FUNCTION rigor_candidate.current_effective_policy(company_input text,unit_input text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,rigor_candidate AS $$
  SELECT to_jsonb(policy) || jsonb_build_object(
    'effectiveFrom',CASE WHEN policy.provenance='legacy_unverified' THEN attestation.attested_at ELSE policy.valid_from::timestamp AT TIME ZONE 'America/Sao_Paulo' END
  )
  FROM rigor_candidate.current_policy AS current
  JOIN rigor_candidate.policies AS policy
    ON policy.tenant_id=current.tenant_id AND policy.company_id=current.company_id
      AND policy.unit_id=current.unit_id AND policy.version=current.version
  LEFT JOIN rigor_candidate.attestations AS attestation
    ON attestation.tenant_id=policy.tenant_id AND attestation.company_id=policy.company_id
      AND attestation.unit_id=policy.unit_id AND attestation.version=policy.version
      AND attestation.snapshot_digest=policy.source_digest
  WHERE current.tenant_id=current_setting('sst.tenant_id',true)
    AND current.company_id=company_input AND current.unit_id=unit_input
    AND policy.valid_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
    AND (policy.provenance='new' OR (policy.provenance='legacy_unverified' AND attestation.actor_user_id IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION rigor_candidate.current_effective_policy(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rigor_candidate.current_effective_policy(text,text) TO rigor_candidate_app;
