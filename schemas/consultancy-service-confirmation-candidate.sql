-- Somente candidato, sem migration/cutover. Depende de operational_authority_candidate,
-- tenant_identity_candidate e tenant_authority_candidate. Uma unidade por proposta.
CREATE SCHEMA consultancy_service_candidate;
CREATE ROLE consultancy_service_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE consultancy_service_candidate_verifier NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Extensao de finalidade do representante M22; nao e novo cadastro de pessoas.
-- Insercao exclusiva do verificador confiavel apos conferencia humana da evidencia.
CREATE TABLE consultancy_service_candidate.authority_reviews (
  tenant_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), registrar_id uuid NOT NULL,
  company_id text NOT NULL, unit_id text NOT NULL, reviewed_by text NOT NULL,
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 1 AND 240),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(), valid_until timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,id), CHECK (valid_until>valid_from),
  FOREIGN KEY (tenant_id,registrar_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.client_registrars(tenant_id,id,company_id,unit_id),
  FOREIGN KEY (tenant_id,reviewed_by) REFERENCES sst.tenant_memberships(tenant_id,user_id)
);
CREATE TABLE consultancy_service_candidate.proposals (
  tenant_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), consultant_user_id text NOT NULL,
  company_id text NOT NULL, unit_id text NOT NULL, description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
  valid_until timestamptz NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','revoked')),
  authority_review_id uuid, confirmed_by text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), CHECK(valid_until>created_at),
  FOREIGN KEY(tenant_id,consultant_user_id) REFERENCES sst.tenant_memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES sst.client_units(tenant_id,id,company_id),
  FOREIGN KEY(tenant_id,authority_review_id) REFERENCES consultancy_service_candidate.authority_reviews(tenant_id,id)
);
CREATE UNIQUE INDEX one_confirmed_service_per_scope ON consultancy_service_candidate.proposals(tenant_id,consultant_user_id,company_id,unit_id) WHERE status='confirmed';
CREATE TABLE consultancy_service_candidate.events (
  tenant_id text NOT NULL, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL,
  actor_user_id text NOT NULL, revision integer NOT NULL, action text NOT NULL CHECK(action IN ('proposed','confirmed','rejected','revoked')),
  snapshot jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,proposal_id,revision),
  FOREIGN KEY(tenant_id,proposal_id) REFERENCES consultancy_service_candidate.proposals(tenant_id,id)
);
CREATE FUNCTION consultancy_service_candidate.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable service evidence/history'; END $$;
CREATE TRIGGER immutable_reviews BEFORE UPDATE OR DELETE ON consultancy_service_candidate.authority_reviews FOR EACH ROW EXECUTE FUNCTION consultancy_service_candidate.immutable_record();
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON consultancy_service_candidate.events FOR EACH ROW EXECUTE FUNCTION consultancy_service_candidate.immutable_record();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['authority_reviews','proposals','events'] LOOP
  EXECUTE format('ALTER TABLE consultancy_service_candidate.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE consultancy_service_candidate.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON consultancy_service_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true))',t);
END LOOP; END $$;

CREATE FUNCTION consultancy_service_candidate.active_consultancy() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM sst.tenants t
    JOIN tenant_authority_candidate.tenant_profiles p ON p.tenant_id=t.id AND p.active AND p.operating_mode='consultancy'
    JOIN tenant_identity_candidate.tenant_profiles ip ON ip.tenant_id=t.id AND ip.active AND ip.operating_mode='consultancy'
    WHERE t.id=current_setting('sst.tenant_id',true) AND t.status='active')
$$;

-- Verifica finalidade, designacao, identidade e escopo atuais. Trava a linha
-- do registrar: revogadores devem usar a mesma trava antes de inserir evento.
CREATE FUNCTION consultancy_service_candidate.current_authority(review_id uuid, actor_id text, company_key text, unit_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r operational_authority_candidate.client_registrars%ROWTYPE; v consultancy_service_candidate.authority_reviews%ROWTYPE;
  tenant_key text:=current_setting('sst.tenant_id',true);
BEGIN
  IF NOT consultancy_service_candidate.active_consultancy() THEN RETURN false; END IF;
  SELECT * INTO v FROM consultancy_service_candidate.authority_reviews WHERE tenant_id=tenant_key AND id=review_id
    AND company_id=company_key AND unit_id=unit_key AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO r FROM operational_authority_candidate.client_registrars WHERE tenant_id=tenant_key AND id=v.registrar_id
    AND user_id=actor_id AND valid_from<=clock_timestamp() AND (valid_until IS NULL OR valid_until>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM operational_authority_candidate.registrar_events WHERE tenant_id=tenant_key AND registrar_id=r.id AND event_type='designated')
    OR EXISTS(SELECT 1 FROM operational_authority_candidate.registrar_events WHERE tenant_id=tenant_key AND registrar_id=r.id AND event_type='revoked') THEN RETURN false; END IF;
  PERFORM 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=actor_id AND role='cliente' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM tenant_identity_candidate.accounts WHERE user_id=actor_id AND status='active' FOR SHARE;
  RETURN FOUND AND NOT EXISTS(SELECT 1 FROM tenant_authority_candidate.admin_grants WHERE tenant_id=tenant_key AND user_id=actor_id AND active);
END $$;

CREATE FUNCTION consultancy_service_candidate.review_authority(registrar_key uuid, evidence_ref text, evidence_digest text, expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r operational_authority_candidate.client_registrars%ROWTYPE; new_id uuid;
  tenant_key text:=current_setting('sst.tenant_id',true); actor_key text:=current_setting('sst.user_id',true);
BEGIN
  SELECT * INTO r FROM operational_authority_candidate.client_registrars WHERE tenant_id=tenant_key AND id=registrar_key FOR UPDATE;
  IF NOT FOUND OR r.user_id=actor_key THEN RAISE EXCEPTION 'review denied'; END IF;
  PERFORM 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reviewer membership required'; END IF;
  IF evidence_ref IS NULL OR evidence_digest IS NULL OR expires_at IS NULL OR expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'review evidence required'; END IF;
  INSERT INTO consultancy_service_candidate.authority_reviews(tenant_id,registrar_id,company_id,unit_id,reviewed_by,evidence_reference,evidence_sha256,valid_until)
    VALUES(tenant_key,r.id,r.company_id,r.unit_id,actor_key,trim(evidence_ref),evidence_digest,expires_at) RETURNING id INTO new_id;
  IF NOT consultancy_service_candidate.current_authority(new_id,r.user_id,r.company_id,r.unit_id) THEN RAISE EXCEPTION 'current client designation required'; END IF;
  RETURN new_id;
END $$;

CREATE FUNCTION consultancy_service_candidate.propose(company_key text, unit_key text, service_description text, expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant_key text:=current_setting('sst.tenant_id',true); actor_key text:=current_setting('sst.user_id',true); p consultancy_service_candidate.proposals%ROWTYPE;
BEGIN
  IF NOT consultancy_service_candidate.active_consultancy() THEN RAISE EXCEPTION 'consultancy denied'; END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant denied'; END IF;
  PERFORM 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=actor_key AND role IN ('consultoria_admin','sst_tst') AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultant denied'; END IF;
  PERFORM 1 FROM tenant_identity_candidate.accounts WHERE user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultant identity denied'; END IF;
  PERFORM 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=company_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'company denied'; END IF;
  IF service_description IS NULL OR expires_at IS NULL OR expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'scope required'; END IF;
  INSERT INTO consultancy_service_candidate.proposals(tenant_id,consultant_user_id,company_id,unit_id,description,valid_until)
    VALUES(tenant_key,actor_key,company_key,unit_key,trim(service_description),expires_at) RETURNING * INTO p;
  INSERT INTO consultancy_service_candidate.events(tenant_id,proposal_id,actor_user_id,revision,action,snapshot) VALUES(tenant_key,p.id,actor_key,p.revision,'proposed',to_jsonb(p));
  RETURN p.id;
END $$;

CREATE FUNCTION consultancy_service_candidate.decide(proposal_key uuid, expected_revision integer, choice text, review_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant_key text:=current_setting('sst.tenant_id',true); actor_key text:=current_setting('sst.user_id',true); p consultancy_service_candidate.proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM consultancy_service_candidate.proposals WHERE tenant_id=tenant_key AND id=proposal_key FOR UPDATE;
  IF NOT FOUND OR expected_revision IS NULL OR p.revision<>expected_revision OR choice IS NULL OR choice NOT IN ('confirmed','rejected','revoked') THEN RAISE EXCEPTION 'stale or invalid decision'; END IF;
  IF actor_key=p.consultant_user_id OR NOT consultancy_service_candidate.current_authority(review_key,actor_key,p.company_id,p.unit_id) THEN RAISE EXCEPTION 'verified client authority required'; END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant denied'; END IF;
  PERFORM 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=p.company_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'company denied'; END IF;
  IF (choice IN ('confirmed','rejected') AND (p.status<>'pending' OR p.valid_until<=clock_timestamp())) OR (choice='revoked' AND p.status<>'confirmed') THEN RAISE EXCEPTION 'invalid transition'; END IF;
  UPDATE consultancy_service_candidate.proposals SET status=choice,revision=revision+1,authority_review_id=review_key,
    confirmed_by=CASE WHEN choice='confirmed' THEN actor_key ELSE confirmed_by END WHERE tenant_id=tenant_key AND id=p.id RETURNING * INTO p;
  INSERT INTO consultancy_service_candidate.events(tenant_id,proposal_id,actor_user_id,revision,action,snapshot) VALUES(tenant_key,p.id,actor_key,p.revision,choice,to_jsonb(p));
  RETURN jsonb_build_object('id',p.id,'revision',p.revision,'status',p.status);
END $$;

CREATE FUNCTION consultancy_service_candidate.can_use(company_key text, unit_key text, permission text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant_key text:=current_setting('sst.tenant_id',true); actor_key text:=current_setting('sst.user_id',true); p consultancy_service_candidate.proposals%ROWTYPE;
BEGIN
  IF permission IS NULL OR permission NOT IN ('dds.read','checklist.read','deviation.report') THEN RETURN false; END IF;
  IF NOT consultancy_service_candidate.active_consultancy() THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM sst.tenants WHERE id=tenant_key AND status='active') OR
    NOT EXISTS(SELECT 1 FROM sst.tenant_memberships WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' AND role IN ('consultoria_admin','sst_tst')) OR
    NOT EXISTS(SELECT 1 FROM tenant_identity_candidate.accounts WHERE user_id=actor_key AND status='active') OR
    NOT EXISTS(SELECT 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=company_key AND status='active') THEN RETURN false; END IF;
  SELECT * INTO p FROM consultancy_service_candidate.proposals WHERE tenant_id=tenant_key AND consultant_user_id=actor_key
    AND company_id=company_key AND unit_id=unit_key AND status='confirmed' AND valid_until>clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN consultancy_service_candidate.current_authority(p.authority_review_id,p.confirmed_by,p.company_id,p.unit_id);
END $$;

CREATE FUNCTION consultancy_service_candidate.preview(proposal_key uuid, review_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant_key text:=current_setting('sst.tenant_id',true); actor_key text:=current_setting('sst.user_id',true); p consultancy_service_candidate.proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM consultancy_service_candidate.proposals WHERE tenant_id=tenant_key AND id=proposal_key FOR SHARE;
  IF NOT FOUND OR NOT consultancy_service_candidate.current_authority(review_key,actor_key,p.company_id,p.unit_id) THEN RAISE EXCEPTION 'preview denied'; END IF;
  RETURN jsonb_build_object('id',p.id,'revision',p.revision,'status',p.status,'consultantUserId',p.consultant_user_id,
    'tenantId',p.tenant_id,'companyId',p.company_id,'unitId',p.unit_id,'description',p.description,'validUntil',p.valid_until);
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA consultancy_service_candidate FROM PUBLIC,consultancy_service_candidate_app,consultancy_service_candidate_verifier;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA consultancy_service_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA consultancy_service_candidate TO consultancy_service_candidate_app,consultancy_service_candidate_verifier;
GRANT EXECUTE ON FUNCTION consultancy_service_candidate.review_authority(uuid,text,text,timestamptz) TO consultancy_service_candidate_verifier;
GRANT EXECUTE ON FUNCTION consultancy_service_candidate.propose(text,text,text,timestamptz),
  consultancy_service_candidate.decide(uuid,integer,text,uuid), consultancy_service_candidate.can_use(text,text,text) TO consultancy_service_candidate_app;
GRANT EXECUTE ON FUNCTION consultancy_service_candidate.preview(uuid,uuid) TO consultancy_service_candidate_app;
