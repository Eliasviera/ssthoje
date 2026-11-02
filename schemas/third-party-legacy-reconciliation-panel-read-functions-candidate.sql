GRANT SELECT ON operational_authority_candidate.client_registrars,
  operational_authority_candidate.registrar_events
  TO third_party_legacy_reconciliation_candidate_executor;

CREATE OR REPLACE FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()
RETURNS TABLE(case_id uuid, company_id text, unit_id text, third_party_id uuid, work_scope text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_role text;
  v_tenant_status text;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active';
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_role IS NULL
     OR v_role NOT IN ('consultoria_admin', 'sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.id, c.company_id, c.unit_id, c.third_party_id, c.work_scope
      FROM operational_authority_candidate.third_party_cases AS c
     WHERE c.tenant_id = v_tenant_id
     ORDER BY c.created_at DESC, c.id;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()
  OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()
  TO third_party_legacy_reconciliation_candidate_app;

CREATE OR REPLACE FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(
  p_source_invitation_ids text[]
)
RETURNS TABLE(
  source_invitation_id text,
  event_id uuid,
  snapshot_id uuid,
  context_sha256 text,
  revision integer,
  event_type text,
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  rationale text,
  occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_role text;
  v_tenant_status text;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL
     OR p_source_invitation_ids IS NULL
     OR cardinality(p_source_invitation_ids) > 500
     OR EXISTS (
       SELECT 1
         FROM unnest(p_source_invitation_ids) AS requested(invitation_id)
        WHERE requested.invitation_id IS NULL
           OR length(trim(requested.invitation_id)) NOT BETWEEN 1 AND 180
     ) THEN
    RAISE EXCEPTION 'invalid invitation state request' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active';
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_role IS NULL
     OR v_role NOT IN ('consultoria_admin', 'sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT ON (e.source_invitation_id)
           e.source_invitation_id, e.id, e.snapshot_id, e.context_sha256,
           e.revision, e.event_type, e.company_id, e.unit_id, e.third_party_id,
           e.workflow_id, e.rationale, e.occurred_at
      FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events AS e
     WHERE e.tenant_id = v_tenant_id
       AND e.source_store = 'third-party-json'
       AND e.source_invitation_id = ANY(p_source_invitation_ids)
     ORDER BY e.source_invitation_id, e.revision DESC;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(text[])
  OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(text[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(text[])
  TO third_party_legacy_reconciliation_candidate_app;

CREATE OR REPLACE FUNCTION third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()
RETURNS TABLE(
  source_invitation_id text,
  event_id uuid,
  snapshot_id uuid,
  context_sha256 text,
  revision integer,
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  rationale text,
  occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_role text;
  v_tenant_status text;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active';
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    WITH latest_link AS (
      SELECT DISTINCT ON (e.source_invitation_id) e.*
        FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events AS e
       WHERE e.tenant_id = v_tenant_id
         AND e.source_store = 'third-party-json'
       ORDER BY e.source_invitation_id, e.revision DESC
    )
    SELECT DISTINCT ON (l.source_invitation_id)
           l.source_invitation_id, l.id, l.snapshot_id, l.context_sha256,
           l.revision, l.company_id, l.unit_id, l.third_party_id, l.workflow_id,
           l.rationale, l.occurred_at
      FROM latest_link AS l
      JOIN operational_authority_candidate.client_registrars AS r
        ON r.tenant_id = v_tenant_id
       AND r.user_id = v_actor_user_id
       AND r.company_id = l.company_id
       AND r.unit_id = l.unit_id
       AND r.valid_from <= clock_timestamp()
       AND (r.valid_until IS NULL OR r.valid_until > clock_timestamp())
     WHERE l.event_type = 'proposed'
       AND EXISTS (
         SELECT 1
           FROM operational_authority_candidate.registrar_events AS e
          WHERE e.tenant_id = r.tenant_id
            AND e.registrar_id = r.id
            AND e.event_type = 'designated'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM operational_authority_candidate.registrar_events AS e
          WHERE e.tenant_id = r.tenant_id
            AND e.registrar_id = r.id
            AND e.event_type = 'revoked'
       )
     ORDER BY l.source_invitation_id, l.revision DESC, r.id;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()
  OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()
  TO third_party_legacy_reconciliation_candidate_app;

GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.capture_invitation_context(
  text,text,text,text,text,text,text,text[]
) TO sst_hoje_app;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.record_invitation_case_link(
  uuid,text,integer,text,text,text,uuid,uuid,text
) TO sst_hoje_app;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases()
  TO sst_hoje_app;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(text[])
  TO sst_hoje_app;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals()
  TO sst_hoje_app;
