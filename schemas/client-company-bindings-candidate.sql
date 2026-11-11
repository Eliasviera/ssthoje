-- Candidato: somente PostgreSQL descartavel. Nao e migration nem cutover.
-- Depende dos candidatos tenant-authority e tenant-self-service-identity.
CREATE SCHEMA client_company_candidate;
CREATE ROLE client_company_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE client_company_candidate.bindings (
  tenant_id text NOT NULL, user_id text NOT NULL, id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0), company_id text NOT NULL,
  unit_ids text[] NOT NULL CHECK (cardinality(unit_ids) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
  reviewed_by text NOT NULL, review_reference text NOT NULL CHECK (length(trim(review_reference)) BETWEEN 1 AND 200),
  PRIMARY KEY (tenant_id,user_id), UNIQUE (tenant_id,id), CHECK (valid_until > valid_from),
  FOREIGN KEY (tenant_id,user_id) REFERENCES sst.tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id)
);
CREATE TABLE client_company_candidate.events (
  tenant_id text NOT NULL, id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL, binding_id uuid NOT NULL, revision integer NOT NULL,
  actor_user_id text NOT NULL, action text NOT NULL CHECK (action IN ('grant','revoke')),
  snapshot jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id,binding_id) REFERENCES client_company_candidate.bindings(tenant_id,id),
  UNIQUE (tenant_id,binding_id,revision)
);
CREATE FUNCTION client_company_candidate.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'binding history is append-only'; END $$;
CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON client_company_candidate.events
FOR EACH ROW EXECUTE FUNCTION client_company_candidate.immutable_event();
ALTER TABLE client_company_candidate.bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_company_candidate.bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE client_company_candidate.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_company_candidate.events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON client_company_candidate.bindings USING (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY tenant_scope ON client_company_candidate.events USING (tenant_id=current_setting('sst.tenant_id',true));

CREATE FUNCTION client_company_candidate.change_binding(
  operation text, target_user text, target_company text, target_units text[],
  expires_at timestamptz, expected_revision integer, review_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  prior client_company_candidate.bindings%ROWTYPE;
  saved client_company_candidate.bindings%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR operation IS NULL OR operation NOT IN ('grant','revoke')
     OR target_user IS NULL OR target_company IS NULL OR expected_revision IS NULL OR expected_revision < 0
     OR review_ref IS NULL OR length(trim(review_ref)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid command'; END IF;
  -- Serializa inclusive a primeira concessao, quando a linha ainda nao existe.
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant_key || ':' || target_user,0));
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;
  PERFORM 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=actor_key
    AND status='active' AND role='consultoria_admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles WHERE tenant_id=tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;
  -- Exige delegacao explicita da empresa inteira; grant de unidade nao amplia acesso.
  PERFORM 1 FROM tenant_authority_candidate.admin_grants WHERE tenant_id=tenant_key AND user_id=actor_key
    AND active AND role IN ('tenant_owner','tenant_admin') AND company_id=target_company AND unit_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;
  SELECT * INTO prior FROM client_company_candidate.bindings WHERE tenant_id=tenant_key AND user_id=target_user FOR UPDATE;
  IF coalesce(prior.revision,0) <> expected_revision THEN RAISE EXCEPTION 'stale revision'; END IF;
  IF prior.id IS NOT NULL AND prior.company_id <> target_company THEN RAISE EXCEPTION 'company change denied'; END IF;
  IF operation='revoke' THEN
    IF prior.id IS NULL OR prior.status <> 'active' THEN RAISE EXCEPTION 'active binding required'; END IF;
    UPDATE client_company_candidate.bindings SET status='revoked',revision=revision+1,reviewed_by=actor_key,review_reference=trim(review_ref)
      WHERE tenant_id=tenant_key AND user_id=target_user RETURNING * INTO saved;
  ELSE
    IF target_user=actor_key OR target_units IS NULL OR cardinality(target_units) NOT BETWEEN 1 AND 100
      OR array_position(target_units,NULL) IS NOT NULL OR expires_at IS NULL OR expires_at <= clock_timestamp()
      OR (SELECT count(DISTINCT u) FROM unnest(target_units) AS u) <> cardinality(target_units) THEN RAISE EXCEPTION 'invalid scope'; END IF;
    PERFORM 1 FROM tenant_identity_candidate.accounts WHERE user_id=target_user AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'activated account required'; END IF;
    PERFORM 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=target_user AND role='cliente' AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active client membership required'; END IF;
    PERFORM 1 FROM tenant_identity_candidate.invitations WHERE tenant_id=tenant_key AND accepted_by=target_user
      AND target_role='cliente' AND status='accepted' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'accepted client invitation required'; END IF;
    IF EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants WHERE tenant_id=tenant_key AND user_id=target_user AND active)
      THEN RAISE EXCEPTION 'administrative target denied'; END IF;
    PERFORM 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=target_company AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active company required'; END IF;
    PERFORM 1 FROM sst.client_units WHERE tenant_id=tenant_key AND company_id=target_company AND id=ANY(target_units) FOR SHARE;
    IF (SELECT count(*) FROM sst.client_units WHERE tenant_id=tenant_key AND company_id=target_company AND id=ANY(target_units)) <> cardinality(target_units)
      THEN RAISE EXCEPTION 'unit outside company'; END IF;
    INSERT INTO client_company_candidate.bindings VALUES(tenant_key,target_user,coalesce(prior.id,gen_random_uuid()),coalesce(prior.revision,0)+1,
      target_company,target_units,'active',clock_timestamp(),expires_at,actor_key,trim(review_ref))
      ON CONFLICT (tenant_id,user_id) DO UPDATE SET revision=EXCLUDED.revision,unit_ids=EXCLUDED.unit_ids,status='active',
        valid_from=EXCLUDED.valid_from,valid_until=EXCLUDED.valid_until,reviewed_by=actor_key,review_reference=trim(review_ref)
      RETURNING * INTO saved;
  END IF;
  INSERT INTO client_company_candidate.events(tenant_id,user_id,binding_id,revision,actor_user_id,action,snapshot)
    VALUES(tenant_key,target_user,saved.id,saved.revision,actor_key,operation,to_jsonb(saved));
  RETURN jsonb_build_object('bindingId',saved.id,'revision',saved.revision,'status',saved.status);
END $$;

CREATE FUNCTION client_company_candidate.resolve_binding() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('id',b.id,'revision',b.revision,'tenantId',b.tenant_id,'companyId',b.company_id,'unitIds',b.unit_ids,'validUntil',b.valid_until)
  FROM client_company_candidate.bindings b
  JOIN sst.tenants t ON t.id=b.tenant_id AND t.status='active'
  JOIN sst.tenant_memberships m ON m.tenant_id=b.tenant_id AND m.user_id=b.user_id AND m.role='cliente' AND m.status='active'
  JOIN tenant_identity_candidate.accounts a ON a.user_id=b.user_id AND a.status='active'
  JOIN tenant_authority_candidate.tenant_profiles p ON p.tenant_id=b.tenant_id AND p.active
  JOIN tenant_identity_candidate.tenant_profiles ip ON ip.tenant_id=b.tenant_id AND ip.active
  JOIN sst.client_companies c ON c.tenant_id=b.tenant_id AND c.id=b.company_id AND c.status='active'
  WHERE b.tenant_id=current_setting('sst.tenant_id',true) AND b.user_id=current_setting('sst.user_id',true)
    AND b.status='active' AND b.valid_from <= clock_timestamp() AND b.valid_until > clock_timestamp()
    AND (SELECT count(*) FROM sst.client_units u WHERE u.tenant_id=b.tenant_id AND u.company_id=b.company_id AND u.id=ANY(b.unit_ids))=cardinality(b.unit_ids)
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA client_company_candidate FROM PUBLIC,client_company_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA client_company_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA client_company_candidate TO client_company_candidate_app;
GRANT EXECUTE ON FUNCTION client_company_candidate.change_binding(text,text,text,text[],timestamptz,integer,text),
  client_company_candidate.resolve_binding() TO client_company_candidate_app;
