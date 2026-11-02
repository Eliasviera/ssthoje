-- M22 candidate only. Apply only after operational-authority-grants-candidate.sql
-- in a disposable PostgreSQL proof database. Not a migration or runtime adapter.
-- A consultant admin may register a reviewed contractor; only the active,
-- explicitly designated client registrar may confirm a case scope.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operational_authority_case_executor') THEN
    CREATE ROLE operational_authority_case_executor
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operational_authority_designation_operator') THEN
    CREATE ROLE operational_authority_designation_operator
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$role$;

CREATE TABLE operational_authority_candidate.third_party_registration_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  third_party_id uuid NOT NULL,
  actor_user_id text NOT NULL,
  cnpj text NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 1 AND 240),
  review_rationale text NOT NULL CHECK (length(trim(review_rationale)) BETWEEN 8 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,request_id),
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE operational_authority_candidate.case_registration_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  registrar_id uuid NOT NULL,
  actor_user_id text NOT NULL,
  work_scope text NOT NULL CHECK (length(trim(work_scope)) BETWEEN 1 AND 1000),
  confirmation_rationale text NOT NULL CHECK (length(trim(confirmation_rationale)) BETWEEN 8 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,request_id),
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,registrar_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.client_registrars(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

ALTER TABLE operational_authority_candidate.third_party_registration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_authority_candidate.third_party_registration_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_authority_candidate.third_party_registration_events
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
ALTER TABLE operational_authority_candidate.case_registration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_authority_candidate.case_registration_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_authority_candidate.case_registration_events
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));

CREATE TRIGGER third_party_registration_events_immutable
  BEFORE UPDATE OR DELETE ON operational_authority_candidate.third_party_registration_events
  FOR EACH ROW EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation();
CREATE TRIGGER third_party_registration_events_no_truncate
  BEFORE TRUNCATE ON operational_authority_candidate.third_party_registration_events
  FOR EACH STATEMENT EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation();
CREATE TRIGGER case_registration_events_immutable
  BEFORE UPDATE OR DELETE ON operational_authority_candidate.case_registration_events
  FOR EACH ROW EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation();
CREATE TRIGGER case_registration_events_no_truncate
  BEFORE TRUNCATE ON operational_authority_candidate.case_registration_events
  FOR EACH STATEMENT EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation();

REVOKE ALL ON TABLE
  operational_authority_candidate.third_party_registration_events,
  operational_authority_candidate.case_registration_events
  FROM PUBLIC, operational_authority_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA operational_authority_candidate FROM PUBLIC;

GRANT USAGE ON SCHEMA sst, operational_authority_candidate
  TO operational_authority_case_executor;
GRANT CREATE ON SCHEMA operational_authority_candidate
  TO operational_authority_case_executor;
GRANT SELECT ON sst.tenants, sst.tenant_memberships
  TO operational_authority_case_executor;
CREATE POLICY memberships_operational_authority_current_tenant
  ON sst.tenant_memberships
  FOR SELECT TO operational_authority_case_executor
  USING (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY memberships_operational_authority_current_tenant_update
  ON sst.tenant_memberships
  FOR UPDATE TO operational_authority_case_executor
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
GRANT UPDATE (row_version) ON sst.tenants, sst.tenant_memberships
  TO operational_authority_case_executor;
GRANT SELECT, INSERT ON
  operational_authority_candidate.third_parties,
  operational_authority_candidate.third_party_cases,
  operational_authority_candidate.third_party_registration_events,
  operational_authority_candidate.case_registration_events,
  operational_authority_candidate.audit_events
  TO operational_authority_case_executor;
GRANT SELECT ON
  operational_authority_candidate.client_registrars,
  operational_authority_candidate.registrar_events
  TO operational_authority_case_executor;
GRANT INSERT ON operational_authority_candidate.client_registrars,
  operational_authority_candidate.registrar_events
  TO operational_authority_case_executor;
GRANT UPDATE (id) ON operational_authority_candidate.client_registrars
  TO operational_authority_case_executor;
GRANT SELECT ON sst.client_companies
  TO operational_authority_case_executor;
GRANT UPDATE (status) ON sst.client_companies
  TO operational_authority_case_executor;
GRANT SELECT ON sst.client_units
  TO operational_authority_case_executor;
GRANT UPDATE (company_id) ON sst.client_units
  TO operational_authority_case_executor;

CREATE UNIQUE INDEX registrar_designation_request_id_idx
  ON operational_authority_candidate.registrar_events(tenant_id,((snapshot->>'requestId')))
  WHERE event_type='designated';
CREATE UNIQUE INDEX registrar_proposal_request_id_idx
  ON operational_authority_candidate.registrar_events(tenant_id,((snapshot->>'requestId')))
  WHERE event_type='proposed';
CREATE UNIQUE INDEX registrar_revocation_request_id_idx
  ON operational_authority_candidate.registrar_events(tenant_id,((snapshot->>'requestId')))
  WHERE event_type='revoked';

CREATE UNIQUE INDEX one_registrar_proposal_event
  ON operational_authority_candidate.registrar_events(tenant_id,registrar_id)
  WHERE event_type='proposed';

CREATE FUNCTION operational_authority_candidate.propose_client_registrar_after_review(
  p_request_id uuid,
  p_designated_user_id text,
  p_company_id text,
  p_unit_id text,
  p_designation_reference text,
  p_review_rationale text,
  p_valid_until timestamptz
) RETURNS TABLE(registrar_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_role text;
  v_tenant_status text;
  v_target_role text;
  v_existing operational_authority_candidate.registrar_events%ROWTYPE;
  v_registrar operational_authority_candidate.client_registrars%ROWTYPE;
  v_company_status text;
  v_unit_company text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_designated_user_id IS NULL OR length(trim(p_designated_user_id)) NOT BETWEEN 1 AND 200
     OR p_company_id IS NULL OR length(trim(p_company_id))=0
     OR p_unit_id IS NULL OR length(trim(p_unit_id))=0
     OR p_designation_reference IS NULL OR length(trim(p_designation_reference)) NOT BETWEEN 1 AND 240
     OR p_review_rationale IS NULL OR length(trim(p_review_rationale)) NOT BETWEEN 8 AND 1000
     OR (p_valid_until IS NOT NULL AND p_valid_until <= v_now) THEN
    RAISE EXCEPTION 'invalid human-verified client designation' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status FROM sst.tenants AS t WHERE t.id=v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_actor_user_id AND m.status='active' FOR SHARE;
  SELECT m.role INTO v_target_role FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=trim(p_designated_user_id) AND m.status='active' FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM v_expected_role
     OR v_role IS DISTINCT FROM 'consultoria_admin' OR v_target_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar-request:' || v_tenant_id || ':' || p_request_id::text, 0));
  SELECT e.* INTO v_existing FROM operational_authority_candidate.registrar_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.event_type='proposed'
     AND e.snapshot->>'requestId'=p_request_id::text;
  IF FOUND THEN
    SELECT r.* INTO v_registrar FROM operational_authority_candidate.client_registrars AS r
     WHERE r.tenant_id=v_tenant_id AND r.id=v_existing.registrar_id;
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor_user_id
       OR v_registrar.user_id IS DISTINCT FROM trim(p_designated_user_id)
       OR v_registrar.company_id IS DISTINCT FROM trim(p_company_id)
       OR v_registrar.unit_id IS DISTINCT FROM trim(p_unit_id)
       OR v_registrar.designation_reference IS DISTINCT FROM trim(p_designation_reference)
       OR v_existing.reason IS DISTINCT FROM trim(p_review_rationale)
       OR v_registrar.valid_until IS DISTINCT FROM p_valid_until THEN
      RAISE EXCEPTION 'designation request conflict' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_existing.registrar_id,false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar-scope:' || v_tenant_id || ':' || trim(p_designated_user_id) || ':' ||
    trim(p_company_id) || ':' || trim(p_unit_id), 0));
  SELECT c.status INTO v_company_status FROM sst.client_companies AS c
   WHERE c.tenant_id=v_tenant_id AND c.id=trim(p_company_id) FOR SHARE;
  SELECT u.company_id INTO v_unit_company FROM sst.client_units AS u
   WHERE u.tenant_id=v_tenant_id AND u.id=trim(p_unit_id) FOR SHARE;
  IF v_company_status IS DISTINCT FROM 'active' OR v_unit_company IS DISTINCT FROM trim(p_company_id) THEN
    RAISE EXCEPTION 'active company and matching unit required' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM operational_authority_candidate.client_registrars AS r
     WHERE r.tenant_id=v_tenant_id AND r.user_id=trim(p_designated_user_id)
       AND r.company_id=trim(p_company_id) AND r.unit_id=trim(p_unit_id)
       AND r.valid_from<=v_now AND (r.valid_until IS NULL OR r.valid_until>v_now)
       AND EXISTS (SELECT 1 FROM operational_authority_candidate.registrar_events AS e
                    WHERE e.tenant_id=r.tenant_id AND e.registrar_id=r.id AND e.event_type IN ('proposed','designated'))
       AND NOT EXISTS (SELECT 1 FROM operational_authority_candidate.registrar_events AS e
                        WHERE e.tenant_id=r.tenant_id AND e.registrar_id=r.id AND e.event_type='revoked')
  ) THEN
    RAISE EXCEPTION 'active registrar designation already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO operational_authority_candidate.client_registrars(
    tenant_id,user_id,company_id,unit_id,designated_by,designation_reference,valid_from,valid_until
  ) VALUES (
    v_tenant_id,trim(p_designated_user_id),trim(p_company_id),trim(p_unit_id),
    v_actor_user_id,trim(p_designation_reference),v_now,p_valid_until
  ) RETURNING id INTO registrar_id;
  INSERT INTO operational_authority_candidate.registrar_events(
    tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot
  ) VALUES (
    v_tenant_id,registrar_id,'proposed',v_actor_user_id,trim(p_review_rationale),
    jsonb_build_object('requestId',p_request_id,'verifiedReference',trim(p_designation_reference),
      'designatedUserId',trim(p_designated_user_id),'companyId',trim(p_company_id),
      'unitId',trim(p_unit_id),'validUntil',p_valid_until)
  );
  INSERT INTO operational_authority_candidate.audit_events(
    tenant_id,actor_user_id,action_code,outcome,company_id,unit_id,reason_code
  ) VALUES (
    v_tenant_id,v_actor_user_id,'thirdparty.registrar.propose','allowed',
    trim(p_company_id),trim(p_unit_id),'external_authority_human_review_recorded'
  );
  inserted:=true;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION operational_authority_candidate.confirm_client_registrar_designation(
  p_request_id uuid,
  p_registrar_id uuid,
  p_confirmation_reference text,
  p_confirmation_rationale text
) RETURNS TABLE(registrar_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_role text;
  v_target_role text;
  v_tenant_status text;
  v_registrar operational_authority_candidate.client_registrars%ROWTYPE;
  v_proposal operational_authority_candidate.registrar_events%ROWTYPE;
  v_existing operational_authority_candidate.registrar_events%ROWTYPE;
  v_company_status text;
  v_unit_company text;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_registrar_id IS NULL
     OR p_confirmation_reference IS NULL OR length(trim(p_confirmation_reference)) NOT BETWEEN 1 AND 240
     OR p_confirmation_rationale IS NULL OR length(trim(p_confirmation_rationale)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'invalid client registrar confirmation' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t WHERE t.id=v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_actor_user_id AND m.status='active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM v_expected_role
     OR v_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'active client confirmation required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar:' || v_tenant_id || ':' || p_registrar_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar-request:' || v_tenant_id || ':' || p_request_id::text, 0));
  SELECT e.* INTO v_proposal
    FROM operational_authority_candidate.registrar_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='proposed'
     AND e.snapshot->>'requestId'=p_request_id::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching reviewed client registrar proposal required' USING ERRCODE = '42501';
  END IF;
  SELECT r.* INTO v_registrar
    FROM operational_authority_candidate.client_registrars AS r
   WHERE r.tenant_id=v_tenant_id AND r.id=p_registrar_id FOR SHARE;
  IF NOT FOUND OR v_proposal.actor_user_id IS NOT DISTINCT FROM v_actor_user_id
     OR v_registrar.user_id IS NOT DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION 'client confirmation must come from a distinct client-side authority' USING ERRCODE = '42501';
  END IF;
  SELECT m.role INTO v_target_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_registrar.user_id AND m.status='active'
   FOR SHARE;
  IF v_target_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'designated client membership must remain active' USING ERRCODE = '42501';
  END IF;

  SELECT e.* INTO v_existing
    FROM operational_authority_candidate.registrar_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='designated';
  IF FOUND THEN
    IF v_existing.snapshot->>'requestId' IS DISTINCT FROM p_request_id::text
       OR v_existing.actor_user_id IS DISTINCT FROM v_actor_user_id
       OR v_existing.snapshot->>'confirmationReference' IS DISTINCT FROM trim(p_confirmation_reference)
       OR v_existing.reason IS DISTINCT FROM trim(p_confirmation_rationale) THEN
      RAISE EXCEPTION 'client registrar confirmation request conflict' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT p_registrar_id,false;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM operational_authority_candidate.registrar_events AS e
     WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='revoked'
  ) THEN
    RAISE EXCEPTION 'revoked client registrar proposal cannot be confirmed' USING ERRCODE = '40001';
  END IF;

  SELECT c.status INTO v_company_status
    FROM sst.client_companies AS c
   WHERE c.tenant_id=v_tenant_id AND c.id=v_registrar.company_id FOR SHARE;
  SELECT u.company_id INTO v_unit_company
    FROM sst.client_units AS u
   WHERE u.tenant_id=v_tenant_id AND u.id=v_registrar.unit_id FOR SHARE;
  IF v_company_status IS DISTINCT FROM 'active' OR v_unit_company IS DISTINCT FROM v_registrar.company_id THEN
    RAISE EXCEPTION 'active company and matching unit required at client confirmation' USING ERRCODE = '23503';
  END IF;

  INSERT INTO operational_authority_candidate.registrar_events(
    tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot
  ) VALUES (
    v_tenant_id,p_registrar_id,'designated',v_actor_user_id,trim(p_confirmation_rationale),
    jsonb_build_object('requestId',p_request_id,'proposalEventId',v_proposal.id,
      'confirmationReference',trim(p_confirmation_reference),'confirmedBy',v_actor_user_id,
      'consultancyReviewerId',v_proposal.actor_user_id,'companyId',v_registrar.company_id,
      'unitId',v_registrar.unit_id)
  );
  INSERT INTO operational_authority_candidate.audit_events(
    tenant_id,actor_user_id,action_code,outcome,company_id,unit_id,reason_code
  ) VALUES (
    v_tenant_id,v_actor_user_id,'thirdparty.registrar.confirm','allowed',
    v_registrar.company_id,v_registrar.unit_id,'client_side_confirmation_recorded'
  );
  registrar_id:=p_registrar_id;
  inserted:=true;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION operational_authority_candidate.revoke_client_registrar_after_review(
  p_request_id uuid,
  p_registrar_id uuid,
  p_review_rationale text
) RETURNS TABLE(registrar_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_role text;
  v_tenant_status text;
  v_registrar operational_authority_candidate.client_registrars%ROWTYPE;
  v_existing operational_authority_candidate.registrar_events%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_registrar_id IS NULL
     OR p_review_rationale IS NULL OR length(trim(p_review_rationale)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'invalid client registrar revocation' USING ERRCODE = '22023';
  END IF;
  SELECT t.status INTO v_tenant_status FROM sst.tenants AS t WHERE t.id=v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_actor_user_id AND m.status='active' FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM v_expected_role
     OR v_role IS DISTINCT FROM 'consultoria_admin' THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar:' || v_tenant_id || ':' || p_registrar_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar-request:' || v_tenant_id || ':' || p_request_id::text, 0));
  SELECT e.* INTO v_existing FROM operational_authority_candidate.registrar_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.event_type='revoked'
     AND e.snapshot->>'requestId'=p_request_id::text;
  IF FOUND THEN
    IF v_existing.registrar_id IS DISTINCT FROM p_registrar_id
       OR v_existing.actor_user_id IS DISTINCT FROM v_actor_user_id
       OR v_existing.reason IS DISTINCT FROM trim(p_review_rationale) THEN
      RAISE EXCEPTION 'registrar revocation request conflict' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT p_registrar_id,false;
    RETURN;
  END IF;

  SELECT r.* INTO v_registrar FROM operational_authority_candidate.client_registrars AS r
   WHERE r.tenant_id=v_tenant_id AND r.id=p_registrar_id FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
       SELECT 1 FROM operational_authority_candidate.registrar_events AS e
        WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type IN ('proposed','designated')
     ) OR EXISTS (
       SELECT 1 FROM operational_authority_candidate.registrar_events AS e
        WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='revoked'
     ) THEN
    RAISE EXCEPTION 'active client registrar designation required' USING ERRCODE = '40001';
  END IF;
  INSERT INTO operational_authority_candidate.registrar_events(
    tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot
  ) VALUES (
    v_tenant_id,p_registrar_id,'revoked',v_actor_user_id,trim(p_review_rationale),
    jsonb_build_object('requestId',p_request_id,'userId',v_registrar.user_id,
      'companyId',v_registrar.company_id,'unitId',v_registrar.unit_id)
  );
  INSERT INTO operational_authority_candidate.audit_events(
    tenant_id,actor_user_id,action_code,outcome,company_id,unit_id,reason_code
  ) VALUES (
    v_tenant_id,v_actor_user_id,'thirdparty.registrar.revoke','allowed',
    v_registrar.company_id,v_registrar.unit_id,'external_authority_human_review_recorded'
  );
  registrar_id:=p_registrar_id;
  inserted:=true;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION operational_authority_candidate.register_reviewed_third_party(
  p_request_id uuid,
  p_cnpj text,
  p_legal_name text,
  p_review_rationale text
) RETURNS TABLE(third_party_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_role text;
  v_tenant_status text;
  v_existing operational_authority_candidate.third_party_registration_events%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_cnpj IS NULL OR p_cnpj !~ '^[0-9]{14}$'
     OR p_legal_name IS NULL OR length(trim(p_legal_name)) NOT BETWEEN 1 AND 240
     OR p_review_rationale IS NULL OR length(trim(p_review_rationale)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'invalid reviewed third-party registration' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t WHERE t.id=v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_actor_user_id AND m.status='active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM v_expected_role
     OR v_role IS DISTINCT FROM 'consultoria_admin' THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-third-party-registration:' || v_tenant_id || ':' || p_request_id::text, 0));
  SELECT e.* INTO v_existing
    FROM operational_authority_candidate.third_party_registration_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor_user_id
       OR v_existing.cnpj IS DISTINCT FROM trim(p_cnpj)
       OR v_existing.legal_name IS DISTINCT FROM trim(p_legal_name)
       OR v_existing.review_rationale IS DISTINCT FROM trim(p_review_rationale) THEN
      RAISE EXCEPTION 'third-party registration request conflict' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_existing.third_party_id, false;
    RETURN;
  END IF;

  INSERT INTO operational_authority_candidate.third_parties(tenant_id,cnpj,legal_name,created_by)
    VALUES (v_tenant_id,trim(p_cnpj),trim(p_legal_name),v_actor_user_id)
    RETURNING id INTO third_party_id;
  INSERT INTO operational_authority_candidate.third_party_registration_events(
    tenant_id,request_id,third_party_id,actor_user_id,cnpj,legal_name,review_rationale
  ) VALUES (
    v_tenant_id,p_request_id,third_party_id,v_actor_user_id,trim(p_cnpj),trim(p_legal_name),trim(p_review_rationale)
  );
  INSERT INTO operational_authority_candidate.audit_events(
    tenant_id,actor_user_id,action_code,outcome,third_party_id,reason_code
  ) VALUES (
    v_tenant_id,v_actor_user_id,'thirdparty.registry.create','allowed',third_party_id,'human_review_recorded'
  );
  inserted := true;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION operational_authority_candidate.create_client_confirmed_case(
  p_request_id uuid,
  p_registrar_id uuid,
  p_company_id text,
  p_unit_id text,
  p_third_party_id uuid,
  p_work_scope text,
  p_confirmation_rationale text
) RETURNS TABLE(workflow_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_role text;
  v_tenant_status text;
  v_company_status text;
  v_registrar operational_authority_candidate.client_registrars%ROWTYPE;
  v_existing operational_authority_candidate.case_registration_events%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_registrar_id IS NULL
     OR p_company_id IS NULL OR length(trim(p_company_id))=0
     OR p_unit_id IS NULL OR length(trim(p_unit_id))=0
     OR p_third_party_id IS NULL
     OR p_work_scope IS NULL OR length(trim(p_work_scope)) NOT BETWEEN 1 AND 1000
     OR p_confirmation_rationale IS NULL
     OR length(trim(p_confirmation_rationale)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'invalid client-confirmed case' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t WHERE t.id=v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=v_tenant_id AND m.user_id=v_actor_user_id AND m.status='active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM v_expected_role
     OR v_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-case-registration:' || v_tenant_id || ':' || p_request_id::text, 0));
  SELECT e.* INTO v_existing
    FROM operational_authority_candidate.case_registration_events AS e
   WHERE e.tenant_id=v_tenant_id AND e.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.registrar_id IS DISTINCT FROM p_registrar_id
       OR v_existing.actor_user_id IS DISTINCT FROM v_actor_user_id
       OR v_existing.company_id IS DISTINCT FROM trim(p_company_id)
       OR v_existing.unit_id IS DISTINCT FROM trim(p_unit_id)
       OR v_existing.third_party_id IS DISTINCT FROM p_third_party_id
       OR v_existing.work_scope IS DISTINCT FROM trim(p_work_scope)
       OR v_existing.confirmation_rationale IS DISTINCT FROM trim(p_confirmation_rationale) THEN
      RAISE EXCEPTION 'case registration request conflict' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_existing.workflow_id, false;
    RETURN;
  END IF;

  SELECT c.status INTO v_company_status
    FROM sst.client_companies AS c
   WHERE c.tenant_id=v_tenant_id AND c.id=trim(p_company_id)
   FOR SHARE;
  IF v_company_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'active client company required' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-client-registrar:' || v_tenant_id || ':' || p_registrar_id::text, 0));
  -- Any future registrar-revocation function must take this same lock before
  -- appending its revocation event, so authorization and case creation serialize.
  SELECT r.* INTO v_registrar
    FROM operational_authority_candidate.client_registrars AS r
   WHERE r.tenant_id=v_tenant_id AND r.id=p_registrar_id
   FOR SHARE;
  IF NOT FOUND OR v_registrar.user_id IS DISTINCT FROM v_actor_user_id
     OR v_registrar.company_id IS DISTINCT FROM trim(p_company_id)
     OR v_registrar.unit_id IS DISTINCT FROM trim(p_unit_id)
     OR v_registrar.valid_from > clock_timestamp()
     OR (v_registrar.valid_until IS NOT NULL AND v_registrar.valid_until <= clock_timestamp())
     OR NOT EXISTS (
       SELECT 1 FROM operational_authority_candidate.registrar_events AS e
        WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='designated'
     )
     OR EXISTS (
       SELECT 1 FROM operational_authority_candidate.registrar_events AS e
        WHERE e.tenant_id=v_tenant_id AND e.registrar_id=p_registrar_id AND e.event_type='revoked'
     ) THEN
    RAISE EXCEPTION 'active client registrar confirmation required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO operational_authority_candidate.third_party_cases(
    tenant_id,company_id,unit_id,third_party_id,work_scope,created_by
  ) VALUES (
    v_tenant_id,trim(p_company_id),trim(p_unit_id),p_third_party_id,trim(p_work_scope),v_actor_user_id
  ) RETURNING id INTO workflow_id;
  INSERT INTO operational_authority_candidate.case_registration_events(
    tenant_id,request_id,workflow_id,company_id,unit_id,third_party_id,registrar_id,
    actor_user_id,work_scope,confirmation_rationale
  ) VALUES (
    v_tenant_id,p_request_id,workflow_id,trim(p_company_id),trim(p_unit_id),p_third_party_id,p_registrar_id,
    v_actor_user_id,trim(p_work_scope),trim(p_confirmation_rationale)
  );
  INSERT INTO operational_authority_candidate.audit_events(
    tenant_id,actor_user_id,action_code,outcome,company_id,unit_id,third_party_id,workflow_id,reason_code
  ) VALUES (
    v_tenant_id,v_actor_user_id,'thirdparty.case.create','allowed',trim(p_company_id),trim(p_unit_id),
    p_third_party_id,workflow_id,'client_registrar_confirmed'
  );
  inserted := true;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION operational_authority_candidate.register_reviewed_third_party(uuid,text,text,text)
  OWNER TO operational_authority_case_executor;
ALTER FUNCTION operational_authority_candidate.create_client_confirmed_case(uuid,uuid,text,text,uuid,text,text)
  OWNER TO operational_authority_case_executor;
ALTER FUNCTION operational_authority_candidate.propose_client_registrar_after_review(uuid,text,text,text,text,text,timestamptz)
  OWNER TO operational_authority_case_executor;
ALTER FUNCTION operational_authority_candidate.confirm_client_registrar_designation(uuid,uuid,text,text)
  OWNER TO operational_authority_case_executor;
ALTER FUNCTION operational_authority_candidate.revoke_client_registrar_after_review(uuid,uuid,text)
  OWNER TO operational_authority_case_executor;
REVOKE CREATE ON SCHEMA operational_authority_candidate FROM operational_authority_case_executor;
REVOKE ALL ON FUNCTION operational_authority_candidate.register_reviewed_third_party(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION operational_authority_candidate.create_client_confirmed_case(uuid,uuid,text,text,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION operational_authority_candidate.propose_client_registrar_after_review(uuid,text,text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION operational_authority_candidate.confirm_client_registrar_designation(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION operational_authority_candidate.revoke_client_registrar_after_review(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operational_authority_candidate.register_reviewed_third_party(uuid,text,text,text)
  TO operational_authority_candidate_app;
GRANT EXECUTE ON FUNCTION operational_authority_candidate.create_client_confirmed_case(uuid,uuid,text,text,uuid,text,text)
  TO operational_authority_candidate_app;
GRANT EXECUTE ON FUNCTION operational_authority_candidate.propose_client_registrar_after_review(uuid,text,text,text,text,text,timestamptz)
  TO operational_authority_designation_operator;
GRANT EXECUTE ON FUNCTION operational_authority_candidate.confirm_client_registrar_designation(uuid,uuid,text,text)
  TO operational_authority_candidate_app;
GRANT EXECUTE ON FUNCTION operational_authority_candidate.revoke_client_registrar_after_review(uuid,uuid,text)
  TO operational_authority_designation_operator;
GRANT USAGE ON SCHEMA operational_authority_candidate
  TO operational_authority_designation_operator;
