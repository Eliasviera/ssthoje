-- Candidate Etapa B only. Apply only in a disposable proof database after
-- third-party-legacy-reconciliation-candidate.sql. Not a migration.
-- The service must reread the JSON source and recompute the v1 digest before
-- calling this function; this SQL function cannot lock or verify that source.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'third_party_legacy_reconciliation_candidate_executor') THEN
    CREATE ROLE third_party_legacy_reconciliation_candidate_executor
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$role$;

GRANT USAGE ON SCHEMA sst, operational_authority_candidate, third_party_legacy_reconciliation_candidate
  TO third_party_legacy_reconciliation_candidate_executor;
-- Needed only so PostgreSQL can assign function ownership to this dedicated
-- NOLOGIN role. The role is never granted to the application login.
GRANT CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT ON sst.tenants, sst.tenant_memberships
  TO third_party_legacy_reconciliation_candidate_executor;
-- PostgreSQL requires UPDATE privilege for SELECT ... FOR SHARE. A harmless
-- version-column grant enables the lock without permitting a role change.
GRANT UPDATE (row_version) ON sst.tenants, sst.tenant_memberships
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT, INSERT ON
  third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT, INSERT ON
  third_party_legacy_reconciliation_candidate.invitation_case_link_events
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT, INSERT ON
  third_party_legacy_reconciliation_candidate.legacy_receipts
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT ON operational_authority_candidate.third_party_cases
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT ON operational_authority_candidate.client_registrars,
  operational_authority_candidate.registrar_events
  TO third_party_legacy_reconciliation_candidate_executor;
-- PostgreSQL requires an UPDATE privilege for SELECT ... FOR SHARE; the
-- isolated executor exposes no direct table update operation to the app.
GRANT UPDATE (id) ON operational_authority_candidate.client_registrars
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT USAGE ON SCHEMA third_party_evidence_candidate
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT SELECT ON
  third_party_evidence_candidate.document_series,
  third_party_evidence_candidate.private_file_objects,
  third_party_evidence_candidate.private_file_object_events,
  third_party_evidence_candidate.document_versions,
  third_party_evidence_candidate.private_file_object_event_heads
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT INSERT ON
  third_party_evidence_candidate.private_file_objects,
  third_party_evidence_candidate.private_file_object_events,
  third_party_evidence_candidate.private_file_object_event_heads
  TO third_party_legacy_reconciliation_candidate_executor;
-- Narrow UPDATE grants only permit SELECT ... FOR SHARE row locks. The
-- executor function never mutates document versions or object heads.
GRANT UPDATE (state) ON third_party_evidence_candidate.document_versions
  TO third_party_legacy_reconciliation_candidate_executor;
GRANT UPDATE (event_id) ON third_party_evidence_candidate.private_file_object_event_heads
  TO third_party_legacy_reconciliation_candidate_executor;

CREATE FUNCTION third_party_legacy_reconciliation_candidate.capture_invitation_context(
  p_source_invitation_id text,
  p_expected_context_sha256 text,
  p_context_sha256 text,
  p_source_company_id text,
  p_source_unit_id text,
  p_contractor_cnpj text,
  p_scope_text text,
  p_requested_categories text[]
) RETURNS TABLE(snapshot_id uuid, revision integer, context_sha256 text, inserted boolean)
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
  v_latest third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots%ROWTYPE;
  v_next_revision integer;
  v_categories text[];
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_source_invitation_id IS NULL OR length(trim(p_source_invitation_id)) NOT BETWEEN 1 AND 180
     OR p_expected_context_sha256 IS NULL OR p_expected_context_sha256 !~ '^[a-f0-9]{64}$'
     OR p_context_sha256 IS NULL OR p_context_sha256 !~ '^[a-f0-9]{64}$'
     OR p_expected_context_sha256 IS DISTINCT FROM p_context_sha256
     OR p_requested_categories IS NULL OR cardinality(p_requested_categories) = 0 THEN
    RAISE EXCEPTION 'invalid invitation snapshot' USING ERRCODE = '22023';
  END IF;
  IF p_contractor_cnpj IS NOT NULL
     AND (length(trim(p_contractor_cnpj)) NOT BETWEEN 1 AND 32) THEN
    RAISE EXCEPTION 'invalid invitation snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id
   FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_role IS NULL
     OR v_role IS DISTINCT FROM v_expected_role
     OR v_role NOT IN ('consultoria_admin', 'sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       SELECT 1 FROM unnest(p_requested_categories) AS u(category)
        WHERE category IS NULL
           OR category NOT IN ('PGR','PCMSO','LTCAT','Ficha de EPI','Treinamento','O.S.','Outro')
     ) THEN
    RAISE EXCEPTION 'invalid invitation snapshot' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(category ORDER BY category COLLATE "C")
    INTO v_categories
    FROM (SELECT DISTINCT category FROM unnest(p_requested_categories) AS u(category)) AS distinct_categories;
  IF cardinality(v_categories) <> cardinality(p_requested_categories)
     OR p_requested_categories IS DISTINCT FROM v_categories THEN
    RAISE EXCEPTION 'invitation categories must be unique and canonically sorted' USING ERRCODE = '22023';
  END IF;

  -- Hash collisions can only serialize unrelated invitations; the full key is
  -- still checked below and defines the actual identity.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-invitation-context:' || v_tenant_id || ':third-party-json:' || p_source_invitation_id, 0));

  SELECT s.* INTO v_latest
    FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
   WHERE s.tenant_id = v_tenant_id
     AND s.source_store = 'third-party-json'
     AND s.source_invitation_id = p_source_invitation_id
   ORDER BY s.revision DESC
   LIMIT 1;

  IF FOUND AND v_latest.context_sha256 = p_context_sha256 THEN
    IF v_latest.source_company_id IS DISTINCT FROM p_source_company_id
       OR v_latest.source_unit_id IS DISTINCT FROM p_source_unit_id
       OR v_latest.contractor_cnpj IS DISTINCT FROM p_contractor_cnpj
       OR v_latest.scope_text IS DISTINCT FROM p_scope_text
       OR v_latest.requested_categories IS DISTINCT FROM p_requested_categories THEN
      RAISE EXCEPTION 'digest conflicts with captured invitation context' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_latest.id, v_latest.revision, v_latest.context_sha256, false;
    RETURN;
  END IF;

  v_next_revision := CASE WHEN FOUND THEN v_latest.revision + 1 ELSE 1 END;
  INSERT INTO third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots (
    tenant_id, source_store, source_invitation_id, revision,
    source_company_id, source_unit_id, contractor_cnpj, scope_text,
    requested_categories, context_sha256, captured_by
  ) VALUES (
    v_tenant_id, 'third-party-json', p_source_invitation_id, v_next_revision,
    p_source_company_id, p_source_unit_id, p_contractor_cnpj, p_scope_text,
    p_requested_categories, p_context_sha256, v_actor_user_id
  ) RETURNING id INTO snapshot_id;

  revision := v_next_revision;
  context_sha256 := p_context_sha256;
  inserted := true;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.capture_invitation_context(
  text,text,text,text,text,text,text,text[]
) OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  FROM third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.capture_invitation_context(
  text,text,text,text,text,text,text,text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.capture_invitation_context(
  text,text,text,text,text,text,text,text[]
) TO third_party_legacy_reconciliation_candidate_app;

GRANT CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  TO third_party_legacy_reconciliation_candidate_executor;

CREATE FUNCTION third_party_legacy_reconciliation_candidate.record_invitation_case_link(
  p_snapshot_id uuid,
  p_expected_context_sha256 text,
  p_expected_revision integer,
  p_next_state text,
  p_company_id text,
  p_unit_id text,
  p_third_party_id uuid,
  p_workflow_id uuid,
  p_rationale text
) RETURNS TABLE(event_id uuid, revision integer, event_type text, inserted boolean)
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
  v_snapshot third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots%ROWTYPE;
  v_latest_snapshot_revision integer;
  v_latest third_party_legacy_reconciliation_candidate.invitation_case_link_events%ROWTYPE;
  v_registrar_id uuid;
  v_current_revision integer;
  v_can_transition boolean := false;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_snapshot_id IS NULL
     OR p_expected_context_sha256 IS NULL OR p_expected_context_sha256 !~ '^[a-f0-9]{64}$'
     OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_next_state IS NULL OR p_next_state NOT IN ('pending','proposed','linked','ambiguous','rejected','unavailable','reopened')
     OR p_rationale IS NULL OR length(trim(p_rationale)) NOT BETWEEN 1 AND 1600 THEN
    RAISE EXCEPTION 'invalid invitation link event' USING ERRCODE = '22023';
  END IF;
  IF p_next_state IN ('proposed','linked') THEN
    IF p_company_id IS NULL OR p_unit_id IS NULL OR p_third_party_id IS NULL OR p_workflow_id IS NULL THEN
      RAISE EXCEPTION 'invalid invitation link target' USING ERRCODE = '22023';
    END IF;
  ELSIF p_company_id IS NOT NULL OR p_unit_id IS NOT NULL OR p_third_party_id IS NOT NULL OR p_workflow_id IS NOT NULL THEN
    RAISE EXCEPTION 'unresolved invitation link cannot contain a case target' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id
   FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_role IS NULL
     OR v_role IS DISTINCT FROM v_expected_role
     OR (p_next_state = 'linked' AND v_role <> 'cliente')
     OR (p_next_state <> 'linked' AND v_role NOT IN ('consultoria_admin', 'sst_tst')) THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  -- Read the immutable snapshot to obtain its natural key, then take the same
  -- lock as capture_invitation_context before rechecking the current snapshot.
  SELECT s.* INTO v_snapshot
    FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
   WHERE s.tenant_id = v_tenant_id
     AND s.id = p_snapshot_id
     AND s.context_sha256 = p_expected_context_sha256;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation snapshot unavailable' USING ERRCODE = '40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-invitation-context:' || v_tenant_id || ':' || v_snapshot.source_store || ':' || v_snapshot.source_invitation_id, 0));

  SELECT max(s.revision) INTO v_latest_snapshot_revision
    FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
   WHERE s.tenant_id = v_tenant_id
     AND s.source_store = v_snapshot.source_store
     AND s.source_invitation_id = v_snapshot.source_invitation_id;
  IF v_snapshot.revision IS DISTINCT FROM v_latest_snapshot_revision THEN
    RAISE EXCEPTION 'invitation snapshot is stale' USING ERRCODE = '40001';
  END IF;

  IF p_next_state = 'linked' THEN
    SELECT r.id INTO v_registrar_id
      FROM operational_authority_candidate.client_registrars AS r
     WHERE r.tenant_id = v_tenant_id
       AND r.user_id = v_actor_user_id
       AND r.company_id = p_company_id
       AND r.unit_id = p_unit_id
       AND r.valid_from <= clock_timestamp()
       AND (r.valid_until IS NULL OR r.valid_until > clock_timestamp())
     ORDER BY r.id
     LIMIT 1;
    IF v_registrar_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'm22-client-registrar:' || v_tenant_id || ':' || v_registrar_id::text, 0));
      SELECT r.id INTO v_registrar_id
        FROM operational_authority_candidate.client_registrars AS r
       WHERE r.tenant_id = v_tenant_id
         AND r.id = v_registrar_id
         AND r.user_id = v_actor_user_id
         AND r.company_id = p_company_id
         AND r.unit_id = p_unit_id
         AND r.valid_from <= clock_timestamp()
         AND (r.valid_until IS NULL OR r.valid_until > clock_timestamp())
         AND EXISTS (
           SELECT 1 FROM operational_authority_candidate.registrar_events AS e
            WHERE e.tenant_id = r.tenant_id AND e.registrar_id = r.id AND e.event_type = 'designated'
         )
         AND NOT EXISTS (
           SELECT 1 FROM operational_authority_candidate.registrar_events AS e
            WHERE e.tenant_id = r.tenant_id AND e.registrar_id = r.id AND e.event_type = 'revoked'
         )
       FOR SHARE OF r;
    END IF;
    IF v_registrar_id IS NULL THEN
      RAISE EXCEPTION 'active client registrar confirmation required' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT e.* INTO v_latest
    FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events AS e
   WHERE e.tenant_id = v_tenant_id
     AND e.source_store = v_snapshot.source_store
     AND e.source_invitation_id = v_snapshot.source_invitation_id
   ORDER BY e.revision DESC
   LIMIT 1;
  v_current_revision := CASE WHEN FOUND THEN v_latest.revision ELSE 0 END;

  IF FOUND
     AND p_expected_revision = v_latest.revision - 1
     AND v_latest.snapshot_id = p_snapshot_id
     AND v_latest.context_sha256 = p_expected_context_sha256
     AND v_latest.event_type = p_next_state
     AND v_latest.company_id IS NOT DISTINCT FROM p_company_id
     AND v_latest.unit_id IS NOT DISTINCT FROM p_unit_id
     AND v_latest.third_party_id IS NOT DISTINCT FROM p_third_party_id
     AND v_latest.workflow_id IS NOT DISTINCT FROM p_workflow_id
     AND v_latest.rationale = p_rationale
     AND v_latest.actor_user_id = v_actor_user_id THEN
    RETURN QUERY SELECT v_latest.id, v_latest.revision, v_latest.event_type, false;
    RETURN;
  END IF;
  IF p_expected_revision <> v_current_revision THEN
    RAISE EXCEPTION 'invitation link revision conflict' USING ERRCODE = '40001';
  END IF;

  IF v_current_revision = 0 THEN
    v_can_transition := p_next_state = 'pending';
  ELSE
    v_can_transition := CASE v_latest.event_type
      WHEN 'pending' THEN p_next_state IN ('proposed','ambiguous','rejected','unavailable')
      WHEN 'proposed' THEN p_next_state IN ('linked','ambiguous','rejected','unavailable')
      WHEN 'ambiguous' THEN p_next_state IN ('proposed','rejected','unavailable')
      WHEN 'unavailable' THEN p_next_state = 'pending'
      WHEN 'linked' THEN p_next_state = 'reopened'
      WHEN 'reopened' THEN p_next_state IN ('proposed','ambiguous','rejected','unavailable')
      WHEN 'rejected' THEN false
      ELSE false
    END;
  END IF;
  IF NOT v_can_transition THEN
    RAISE EXCEPTION 'invitation link transition denied' USING ERRCODE = '23514';
  END IF;

  IF p_next_state = 'linked' AND (
    v_latest.event_type IS DISTINCT FROM 'proposed'
    OR v_latest.company_id IS DISTINCT FROM p_company_id
    OR v_latest.unit_id IS DISTINCT FROM p_unit_id
    OR v_latest.third_party_id IS DISTINCT FROM p_third_party_id
    OR v_latest.workflow_id IS DISTINCT FROM p_workflow_id
  ) THEN
    RAISE EXCEPTION 'client confirmation must match the current proposal' USING ERRCODE = '23514';
  END IF;

  IF p_next_state IN ('proposed','linked') AND NOT EXISTS (
    SELECT 1
      FROM operational_authority_candidate.third_party_cases AS c
     WHERE c.tenant_id = v_tenant_id
       AND c.id = p_workflow_id
       AND c.company_id = p_company_id
       AND c.unit_id = p_unit_id
       AND c.third_party_id = p_third_party_id
  ) THEN
    RAISE EXCEPTION 'invitation link target unavailable' USING ERRCODE = '23503';
  END IF;

  INSERT INTO third_party_legacy_reconciliation_candidate.invitation_case_link_events (
    tenant_id, source_store, source_invitation_id, snapshot_id, context_sha256,
    revision, event_type, company_id, unit_id, third_party_id, workflow_id,
    rationale, actor_user_id
  ) VALUES (
    v_tenant_id, v_snapshot.source_store, v_snapshot.source_invitation_id,
    p_snapshot_id, p_expected_context_sha256, v_current_revision + 1, p_next_state,
    p_company_id, p_unit_id, p_third_party_id, p_workflow_id, p_rationale, v_actor_user_id
  ) RETURNING id INTO event_id;

  revision := v_current_revision + 1;
  event_type := p_next_state;
  inserted := true;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.record_invitation_case_link(
  uuid,text,integer,text,text,text,uuid,uuid,text
) OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  FROM third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.record_invitation_case_link(
  uuid,text,integer,text,text,text,uuid,uuid,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.record_invitation_case_link(
  uuid,text,integer,text,text,text,uuid,uuid,text
) TO third_party_legacy_reconciliation_candidate_app;

GRANT SELECT, INSERT ON
  third_party_legacy_reconciliation_candidate.reconciliation_events
  TO third_party_legacy_reconciliation_candidate_executor;

CREATE FUNCTION third_party_legacy_reconciliation_candidate.assert_legacy_replacement_chain(
  p_tenant_id text,
  p_source_store text,
  p_source_invitation_id text,
  p_source_receipt_id text,
  p_source_kind text,
  p_source_company_id text,
  p_source_unit_id text,
  p_contractor_cnpj text,
  p_scope_text text,
  p_company_id text,
  p_unit_id text,
  p_third_party_id uuid,
  p_workflow_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_child third_party_legacy_reconciliation_candidate.legacy_receipts%ROWTYPE;
  v_parent third_party_legacy_reconciliation_candidate.legacy_receipts%ROWTYPE;
  v_parent_snapshot third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots%ROWTYPE;
  v_parent_link third_party_legacy_reconciliation_candidate.invitation_case_link_events%ROWTYPE;
  v_parent_count integer;
  v_sibling_count integer;
  v_seen_receipt_ids text[] := ARRAY[p_source_receipt_id];
BEGIN
  -- Any future trusted receipt-ingestion function must take this same key
  -- before inserting a row that replaces this receipt, preventing a concurrent fork.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-legacy-replacement:' || p_tenant_id || ':' || p_source_store || ':' || p_source_receipt_id, 0));
  SELECT r.* INTO v_child
    FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
   WHERE r.tenant_id = p_tenant_id AND r.source_store = p_source_store
     AND r.source_invitation_id = p_source_invitation_id AND r.source_receipt_id = p_source_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy receipt unavailable' USING ERRCODE = '40001';
  END IF;
  SELECT count(*) INTO v_sibling_count
    FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
   WHERE r.tenant_id = p_tenant_id AND r.source_store = p_source_store
     AND r.source_replaces_receipt_id = p_source_receipt_id;
  IF v_sibling_count <> 0 THEN
    RAISE EXCEPTION 'legacy receipt has a replacement and is not current' USING ERRCODE = '23514';
  END IF;

  WHILE v_child.source_replaces_receipt_id IS NOT NULL LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'm22-legacy-replacement:' || p_tenant_id || ':' || p_source_store || ':' || v_child.source_replaces_receipt_id, 0));

    SELECT count(*) INTO v_parent_count
      FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
     WHERE r.tenant_id = p_tenant_id AND r.source_store = p_source_store
       AND r.source_receipt_id = v_child.source_replaces_receipt_id;
    IF v_parent_count = 0 THEN
      RAISE EXCEPTION 'legacy replacement predecessor missing' USING ERRCODE = '40001';
    ELSIF v_parent_count <> 1 THEN
      RAISE EXCEPTION 'legacy replacement predecessor ambiguous' USING ERRCODE = '40001';
    END IF;

    SELECT r.* INTO v_parent
      FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
     WHERE r.tenant_id = p_tenant_id AND r.source_store = p_source_store
       AND r.source_receipt_id = v_child.source_replaces_receipt_id;
    IF v_parent.source_receipt_id = ANY(v_seen_receipt_ids) THEN
      RAISE EXCEPTION 'legacy replacement cycle detected' USING ERRCODE = '23514';
    END IF;
    v_seen_receipt_ids := array_append(v_seen_receipt_ids, v_parent.source_receipt_id);

    IF v_parent.source_kind IS DISTINCT FROM p_source_kind
       OR v_parent.source_received_at > v_child.source_received_at THEN
      RAISE EXCEPTION 'legacy replacement series or time order mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT s.* INTO v_parent_snapshot
      FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
     WHERE s.tenant_id = p_tenant_id AND s.source_store = p_source_store
       AND s.source_invitation_id = v_parent.source_invitation_id
     ORDER BY s.revision DESC LIMIT 1;
    IF NOT FOUND
       OR v_parent_snapshot.source_company_id IS DISTINCT FROM p_source_company_id
       OR v_parent_snapshot.source_unit_id IS DISTINCT FROM p_source_unit_id
       OR v_parent_snapshot.contractor_cnpj IS DISTINCT FROM p_contractor_cnpj
       OR (CASE
         WHEN nullif(btrim(v_parent_snapshot.scope_text), '') IS NOT NULL
          AND nullif(btrim(p_scope_text), '') IS NOT NULL
           THEN lower(btrim(v_parent_snapshot.scope_text)) <> lower(btrim(p_scope_text))
         ELSE v_parent.source_invitation_id <> p_source_invitation_id
       END) THEN
      RAISE EXCEPTION 'legacy replacement source scope mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT e.* INTO v_parent_link
      FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events AS e
     WHERE e.tenant_id = p_tenant_id AND e.source_store = p_source_store
       AND e.source_invitation_id = v_parent.source_invitation_id
     ORDER BY e.revision DESC LIMIT 1;
    IF NOT FOUND OR v_parent_link.event_type IS DISTINCT FROM 'linked'
       OR v_parent_link.snapshot_id IS DISTINCT FROM v_parent_snapshot.id
       OR v_parent_link.context_sha256 IS DISTINCT FROM v_parent_snapshot.context_sha256
       OR v_parent_link.company_id IS DISTINCT FROM p_company_id
       OR v_parent_link.unit_id IS DISTINCT FROM p_unit_id
       OR v_parent_link.third_party_id IS DISTINCT FROM p_third_party_id
       OR v_parent_link.workflow_id IS DISTINCT FROM p_workflow_id THEN
      RAISE EXCEPTION 'legacy replacement confirmed case mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_sibling_count
      FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
     WHERE r.tenant_id = p_tenant_id AND r.source_store = p_source_store
       AND r.source_replaces_receipt_id = v_parent.source_receipt_id;
    IF v_sibling_count <> 1 THEN
      RAISE EXCEPTION 'legacy replacement chain is forked or ambiguous' USING ERRCODE = '23514';
    END IF;

    v_child := v_parent;
  END LOOP;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.assert_legacy_replacement_chain(
  text,text,text,text,text,text,text,text,text,text,text,uuid,uuid
) OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.assert_legacy_replacement_chain(
  text,text,text,text,text,text,text,text,text,text,text,uuid,uuid
) FROM PUBLIC;

-- Captures immutable receipt metadata only. The caller must reread the source
-- file and calculate SHA-256/size; this function never claims to verify bytes.
CREATE FUNCTION third_party_legacy_reconciliation_candidate.capture_legacy_receipt(
  p_source_invitation_id text,
  p_expected_context_sha256 text,
  p_expected_snapshot_revision integer,
  p_source_receipt_id text,
  p_source_kind text,
  p_source_file_name text,
  p_content_sha256 text,
  p_byte_size bigint,
  p_source_received_at timestamptz,
  p_source_valid_until date,
  p_source_replaces_receipt_id text,
  p_private_object_id uuid,
  p_backend_code text,
  p_object_locator text
) RETURNS TABLE(legacy_receipt_id uuid, inserted boolean)
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
  v_snapshot third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots%ROWTYPE;
  v_existing third_party_legacy_reconciliation_candidate.legacy_receipts%ROWTYPE;
  v_object third_party_evidence_candidate.private_file_objects%ROWTYPE;
  v_head third_party_evidence_candidate.private_file_object_event_heads%ROWTYPE;
  v_object_event third_party_evidence_candidate.private_file_object_events%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_source_invitation_id IS NULL OR length(trim(p_source_invitation_id)) NOT BETWEEN 1 AND 180
     OR p_expected_context_sha256 IS NULL OR p_expected_context_sha256 !~ '^[a-f0-9]{64}$'
     OR p_expected_snapshot_revision IS NULL OR p_expected_snapshot_revision < 1
     OR p_source_receipt_id IS NULL OR length(trim(p_source_receipt_id)) NOT BETWEEN 1 AND 180
     OR p_source_kind IS NULL OR p_source_kind NOT IN ('PGR','PCMSO','LTCAT','Ficha de EPI','Treinamento','O.S.','Outro')
     OR p_source_file_name IS NULL OR length(trim(p_source_file_name)) NOT BETWEEN 1 AND 180
     OR p_source_file_name ~ '[[:cntrl:]]'
     OR position('/' IN p_source_file_name) > 0 OR position(chr(92) IN p_source_file_name) > 0
     OR lower(trim(p_source_file_name)) NOT LIKE '%.pdf'
     OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[a-f0-9]{64}$'
     OR p_byte_size IS NULL OR p_byte_size < 1 OR p_byte_size > 7340032
     OR p_source_received_at IS NULL
     OR (p_source_replaces_receipt_id IS NOT NULL AND
         (length(trim(p_source_replaces_receipt_id)) NOT BETWEEN 1 AND 180
          OR p_source_replaces_receipt_id = p_source_receipt_id))
     OR p_private_object_id IS NULL
     OR p_backend_code IS NULL OR p_backend_code !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     OR p_object_locator IS NULL OR length(trim(p_object_locator)) NOT BETWEEN 1 AND 500
     OR p_object_locator ~ '[[:cntrl:]]' OR p_object_locator ~* '^[a-z][a-z0-9+.-]*://' THEN
    RAISE EXCEPTION 'invalid legacy receipt' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t WHERE t.id = v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id AND m.user_id = v_actor_user_id AND m.status = 'active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_role IS NULL OR v_role IS DISTINCT FROM v_expected_role
     OR v_role NOT IN ('consultoria_admin','sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  -- Keep invitation revisions and replacement-chain inserts in a stable lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-invitation-context:' || v_tenant_id || ':third-party-json:' || p_source_invitation_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-legacy-replacement:' || v_tenant_id || ':third-party-json:' || p_source_receipt_id, 0));
  IF p_source_replaces_receipt_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'm22-legacy-replacement:' || v_tenant_id || ':third-party-json:' || p_source_replaces_receipt_id, 0));
  END IF;

  SELECT s.* INTO v_snapshot
    FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
   WHERE s.tenant_id = v_tenant_id AND s.source_store = 'third-party-json'
     AND s.source_invitation_id = p_source_invitation_id
   ORDER BY s.revision DESC LIMIT 1;
  IF NOT FOUND OR v_snapshot.revision <> p_expected_snapshot_revision
     OR v_snapshot.context_sha256 IS DISTINCT FROM p_expected_context_sha256 THEN
    RAISE EXCEPTION 'invitation snapshot changed' USING ERRCODE = '40001';
  END IF;
  IF NOT (p_source_kind = ANY(v_snapshot.requested_categories)) THEN
    RAISE EXCEPTION 'receipt category was not requested' USING ERRCODE = '23514';
  END IF;

  SELECT r.* INTO v_existing
    FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
   WHERE r.tenant_id = v_tenant_id AND r.source_store = 'third-party-json'
     AND r.source_invitation_id = p_source_invitation_id AND r.source_receipt_id = p_source_receipt_id;
  IF FOUND THEN
    IF v_existing.source_kind IS DISTINCT FROM p_source_kind
       OR v_existing.source_file_name IS DISTINCT FROM p_source_file_name
       OR v_existing.content_sha256 IS DISTINCT FROM p_content_sha256
       OR v_existing.byte_size IS DISTINCT FROM p_byte_size
       OR v_existing.source_received_at IS DISTINCT FROM p_source_received_at
       OR v_existing.source_valid_until IS DISTINCT FROM p_source_valid_until
       OR v_existing.source_replaces_receipt_id IS DISTINCT FROM p_source_replaces_receipt_id
       OR v_existing.private_file_object_id IS DISTINCT FROM p_private_object_id THEN
      RAISE EXCEPTION 'receipt identity conflicts with captured metadata' USING ERRCODE = '40001';
    END IF;
    SELECT o.* INTO v_object FROM third_party_evidence_candidate.private_file_objects AS o
     WHERE o.tenant_id = v_tenant_id AND o.id = p_private_object_id;
    SELECT h.* INTO v_head FROM third_party_evidence_candidate.private_file_object_event_heads AS h
     WHERE h.tenant_id = v_tenant_id AND h.object_id = p_private_object_id;
    SELECT e.* INTO v_object_event FROM third_party_evidence_candidate.private_file_object_events AS e
     WHERE e.tenant_id = v_tenant_id AND e.id = v_head.event_id AND e.object_id = p_private_object_id;
    IF v_object.backend_code IS DISTINCT FROM p_backend_code
       OR v_object.object_locator IS DISTINCT FROM p_object_locator
       OR v_object.content_sha256 IS DISTINCT FROM p_content_sha256
       OR v_object.byte_size IS DISTINCT FROM p_byte_size
       OR v_object_event.event_type IS DISTINCT FROM 'verified'
       OR v_object_event.content_sha256 IS DISTINCT FROM p_content_sha256
       OR v_object_event.byte_size IS DISTINCT FROM p_byte_size THEN
      RAISE EXCEPTION 'private object is not the verified receipt copy' USING ERRCODE = '40001';
    END IF;
    legacy_receipt_id := v_existing.id;
    inserted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- The trusted service has already copied and reread the private object.
  -- This transaction records that claim and the legacy receipt atomically.
  INSERT INTO third_party_evidence_candidate.private_file_objects (
    tenant_id,id,backend_code,object_locator,content_sha256,byte_size,registered_by
  ) VALUES (
    v_tenant_id,p_private_object_id,p_backend_code,trim(p_object_locator),p_content_sha256,p_byte_size,v_actor_user_id
  );
  INSERT INTO third_party_evidence_candidate.private_file_object_events (
    tenant_id,object_id,event_type,content_sha256,byte_size,actor_user_id,reason
  ) VALUES (
    v_tenant_id,p_private_object_id,'verified',p_content_sha256,p_byte_size,v_actor_user_id,
    'Cópia privada validada por leitura de retorno'
  ) RETURNING id INTO v_head.event_id;
  INSERT INTO third_party_evidence_candidate.private_file_object_event_heads (
    tenant_id,object_id,event_id
  ) VALUES (v_tenant_id,p_private_object_id,v_head.event_id);

  INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts (
    tenant_id, source_store, source_invitation_id, source_receipt_id, source_kind,
    source_file_name, content_sha256, byte_size, source_received_at, source_valid_until,
    source_replaces_receipt_id, private_file_object_id, imported_by
  ) VALUES (
    v_tenant_id, 'third-party-json', p_source_invitation_id, p_source_receipt_id, p_source_kind,
    trim(p_source_file_name), p_content_sha256, p_byte_size, p_source_received_at, p_source_valid_until,
    p_source_replaces_receipt_id, p_private_object_id, v_actor_user_id
  ) RETURNING id INTO legacy_receipt_id;
  inserted := true;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.capture_legacy_receipt(
  text,text,integer,text,text,text,text,bigint,timestamptz,date,text,uuid,text,text
) OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.capture_legacy_receipt(
  text,text,integer,text,text,text,text,bigint,timestamptz,date,text,uuid,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.capture_legacy_receipt(
  text,text,integer,text,text,text,text,bigint,timestamptz,date,text,uuid,text,text
) TO third_party_legacy_reconciliation_candidate_app;

CREATE FUNCTION third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(
  p_legacy_receipt_id uuid,
  p_expected_context_sha256 text,
  p_expected_revision integer,
  p_next_state text,
  p_document_version_id uuid,
  p_rationale text
) RETURNS TABLE(event_id uuid, revision integer, event_type text, inserted boolean)
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
  v_receipt third_party_legacy_reconciliation_candidate.legacy_receipts%ROWTYPE;
  v_snapshot third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots%ROWTYPE;
  v_link third_party_legacy_reconciliation_candidate.invitation_case_link_events%ROWTYPE;
  v_latest third_party_legacy_reconciliation_candidate.reconciliation_events%ROWTYPE;
  v_version third_party_evidence_candidate.document_versions%ROWTYPE;
  v_head_event_id uuid;
  v_current_revision integer;
  v_target_kind text;
  v_can_transition boolean := false;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_legacy_receipt_id IS NULL
     OR p_expected_context_sha256 IS NULL OR p_expected_context_sha256 !~ '^[a-f0-9]{64}$'
     OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_next_state IS NULL OR p_next_state NOT IN ('pending','matched','ambiguous','rejected','unavailable','reopened')
     OR p_rationale IS NULL OR length(trim(p_rationale)) NOT BETWEEN 1 AND 1600
     OR (p_next_state = 'matched' AND p_document_version_id IS NULL)
     OR (p_next_state <> 'matched' AND p_document_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid receipt reconciliation event' USING ERRCODE = '22023';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t WHERE t.id = v_tenant_id FOR SHARE;
  SELECT m.role INTO v_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id AND m.user_id = v_actor_user_id AND m.status = 'active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active' OR v_role IS NULL
     OR v_role IS DISTINCT FROM v_expected_role
     OR v_role NOT IN ('consultoria_admin','sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_receipt
    FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
   WHERE r.tenant_id = v_tenant_id AND r.id = p_legacy_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy receipt unavailable' USING ERRCODE = '40001';
  END IF;

  -- All invitation operations take this lock before any receipt lock. This
  -- makes a concurrent snapshot/link change visible before the receipt event.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-invitation-context:' || v_tenant_id || ':' || v_receipt.source_store || ':' || v_receipt.source_invitation_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'm22-legacy-receipt:' || v_tenant_id || ':' || v_receipt.source_store || ':' ||
    v_receipt.source_invitation_id || ':' || v_receipt.source_receipt_id, 0));

  SELECT s.* INTO v_snapshot
    FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots AS s
   WHERE s.tenant_id = v_tenant_id AND s.source_store = v_receipt.source_store
     AND s.source_invitation_id = v_receipt.source_invitation_id
   ORDER BY s.revision DESC LIMIT 1;
  IF NOT FOUND OR v_snapshot.context_sha256 IS DISTINCT FROM p_expected_context_sha256 THEN
    RAISE EXCEPTION 'invitation context changed or unavailable' USING ERRCODE = '40001';
  END IF;

  SELECT e.* INTO v_link
    FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events AS e
   WHERE e.tenant_id = v_tenant_id AND e.source_store = v_receipt.source_store
     AND e.source_invitation_id = v_receipt.source_invitation_id
   ORDER BY e.revision DESC LIMIT 1;

  IF p_next_state = 'matched' THEN
    IF v_link.event_type IS DISTINCT FROM 'linked'
       OR v_link.snapshot_id IS DISTINCT FROM v_snapshot.id
       OR v_link.context_sha256 IS DISTINCT FROM v_snapshot.context_sha256 THEN
      RAISE EXCEPTION 'current invitation link unavailable' USING ERRCODE = '40001';
    END IF;
    PERFORM third_party_legacy_reconciliation_candidate.assert_legacy_replacement_chain(
      v_tenant_id, v_receipt.source_store, v_receipt.source_invitation_id,
      v_receipt.source_receipt_id, v_receipt.source_kind,
      v_snapshot.source_company_id, v_snapshot.source_unit_id,
      v_snapshot.contractor_cnpj, v_snapshot.scope_text,
      v_link.company_id, v_link.unit_id, v_link.third_party_id, v_link.workflow_id
    );
  END IF;

  SELECT e.* INTO v_latest
    FROM third_party_legacy_reconciliation_candidate.reconciliation_events AS e
   WHERE e.tenant_id = v_tenant_id AND e.legacy_receipt_id = p_legacy_receipt_id
   ORDER BY e.revision DESC LIMIT 1;
  v_current_revision := CASE WHEN FOUND THEN v_latest.revision ELSE 0 END;

  IF FOUND AND p_expected_revision = v_latest.revision - 1
     AND v_latest.source_kind = v_receipt.source_kind
     AND v_latest.event_type = p_next_state
     AND v_latest.document_version_id IS NOT DISTINCT FROM p_document_version_id
     AND v_latest.rationale = p_rationale
     AND v_latest.actor_user_id = v_actor_user_id
     AND (p_next_state <> 'matched' OR (
       v_link.event_type = 'linked'
       AND v_link.snapshot_id = v_snapshot.id
       AND v_link.context_sha256 = v_snapshot.context_sha256
       AND EXISTS (
         SELECT 1
           FROM third_party_evidence_candidate.document_versions AS d
           JOIN third_party_evidence_candidate.private_file_object_event_heads AS h
             ON h.tenant_id = d.tenant_id AND h.object_id = d.storage_object_id
           JOIN third_party_evidence_candidate.private_file_object_events AS o
             ON o.tenant_id = h.tenant_id AND o.id = h.event_id AND o.object_id = h.object_id
          WHERE d.tenant_id = v_tenant_id AND d.id = v_latest.document_version_id
            AND d.state = 'current' AND d.third_party_id = v_link.third_party_id
            AND d.document_kind = v_latest.target_document_kind
            AND d.content_sha256 = v_receipt.content_sha256 AND d.byte_size = v_receipt.byte_size
            AND o.event_type = 'verified' AND o.content_sha256 = v_receipt.content_sha256
            AND o.byte_size = v_receipt.byte_size
       )
     )) THEN
    RETURN QUERY SELECT v_latest.id, v_latest.revision, v_latest.event_type, false;
    RETURN;
  END IF;
  IF p_expected_revision <> v_current_revision THEN
    RAISE EXCEPTION 'receipt reconciliation revision conflict' USING ERRCODE = '40001';
  END IF;

  IF v_current_revision = 0 THEN
    v_can_transition := p_next_state = 'pending';
  ELSE
    v_can_transition := CASE v_latest.event_type
      WHEN 'pending' THEN p_next_state IN ('matched','ambiguous','rejected','unavailable')
      WHEN 'ambiguous' THEN p_next_state IN ('matched','rejected','unavailable')
      WHEN 'unavailable' THEN p_next_state = 'pending'
      WHEN 'matched' THEN p_next_state = 'reopened'
      WHEN 'reopened' THEN p_next_state IN ('matched','ambiguous','rejected','unavailable')
      WHEN 'rejected' THEN false
      ELSE false
    END;
  END IF;
  IF NOT v_can_transition THEN
    RAISE EXCEPTION 'receipt reconciliation transition denied' USING ERRCODE = '23514';
  END IF;

  IF p_next_state = 'matched' THEN
    IF v_link.event_type IS DISTINCT FROM 'linked'
       OR v_link.snapshot_id IS DISTINCT FROM v_snapshot.id
       OR v_link.context_sha256 IS DISTINCT FROM v_snapshot.context_sha256 THEN
      RAISE EXCEPTION 'current invitation link unavailable' USING ERRCODE = '40001';
    END IF;
    v_target_kind := CASE v_receipt.source_kind
      WHEN 'PGR' THEN 'PGR' WHEN 'PCMSO' THEN 'PCMSO' WHEN 'LTCAT' THEN 'LTCAT'
      WHEN 'Outro' THEN 'OTHER' ELSE NULL END;
    IF v_target_kind IS NULL THEN
      RAISE EXCEPTION 'legacy receipt category has no supported target' USING ERRCODE = '23514';
    END IF;

    SELECT d.* INTO v_version
      FROM third_party_evidence_candidate.document_versions AS d
     WHERE d.tenant_id = v_tenant_id AND d.id = p_document_version_id
     FOR SHARE;
    IF NOT FOUND OR v_version.state IS DISTINCT FROM 'current'
       OR v_version.third_party_id IS DISTINCT FROM v_link.third_party_id
       OR v_version.document_kind IS DISTINCT FROM v_target_kind
       OR v_version.content_sha256 IS DISTINCT FROM v_receipt.content_sha256
       OR v_version.byte_size IS DISTINCT FROM v_receipt.byte_size THEN
      RAISE EXCEPTION 'document version does not match receipt and current link' USING ERRCODE = '23503';
    END IF;

    SELECT h.event_id INTO v_head_event_id
      FROM third_party_evidence_candidate.private_file_object_event_heads AS h
     WHERE h.tenant_id = v_tenant_id AND h.object_id = v_version.storage_object_id
     FOR SHARE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM third_party_evidence_candidate.private_file_object_events AS e
       WHERE e.tenant_id = v_tenant_id AND e.id = v_head_event_id
         AND e.object_id = v_version.storage_object_id AND e.event_type = 'verified'
         AND e.content_sha256 = v_receipt.content_sha256 AND e.byte_size = v_receipt.byte_size
    ) THEN
      RAISE EXCEPTION 'private object is not currently verified' USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events (
    tenant_id, legacy_receipt_id, source_kind, revision, event_type,
    company_id, unit_id, third_party_id, workflow_id,
    document_series_id, document_version_id, invitation_case_link_event_id,
    target_document_kind, rationale, actor_user_id
  ) VALUES (
    v_tenant_id, p_legacy_receipt_id, v_receipt.source_kind, v_current_revision + 1, p_next_state,
    CASE WHEN p_next_state='matched' THEN v_link.company_id END,
    CASE WHEN p_next_state='matched' THEN v_link.unit_id END,
    CASE WHEN p_next_state='matched' THEN v_link.third_party_id END,
    CASE WHEN p_next_state='matched' THEN v_link.workflow_id END,
    CASE WHEN p_next_state='matched' THEN v_version.series_id END,
    CASE WHEN p_next_state='matched' THEN v_version.id END,
    CASE WHEN p_next_state='matched' THEN v_link.id END,
    CASE WHEN p_next_state='matched' THEN v_target_kind END,
    p_rationale, v_actor_user_id
  ) RETURNING id INTO event_id;

  revision := v_current_revision + 1;
  event_type := p_next_state;
  inserted := true;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(
  uuid,text,integer,text,uuid,text
) OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  FROM third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(
  uuid,text,integer,text,uuid,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(
  uuid,text,integer,text,uuid,text
) TO third_party_legacy_reconciliation_candidate_app;

-- Narrow read path for local-storage recovery. The web role receives only
-- EXECUTE; the function owner remains subject to forced tenant RLS.
GRANT CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  TO third_party_legacy_reconciliation_candidate_executor;
CREATE FUNCTION third_party_legacy_reconciliation_candidate.list_registered_private_file_objects()
RETURNS TABLE(tenant_id text, object_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tenant_id text := nullif(current_setting('sst.tenant_id', true), '');
  v_actor_user_id text := nullif(current_setting('sst.user_id', true), '');
  v_expected_role text := nullif(current_setting('sst.membership_role', true), '');
  v_membership_role text;
  v_tenant_status text;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  SELECT t.status INTO v_tenant_status
    FROM sst.tenants AS t
   WHERE t.id = v_tenant_id
   FOR SHARE;
  SELECT m.role INTO v_membership_role
    FROM sst.tenant_memberships AS m
   WHERE m.tenant_id = v_tenant_id
     AND m.user_id = v_actor_user_id
     AND m.status = 'active'
   FOR SHARE;
  IF v_tenant_status IS DISTINCT FROM 'active'
     OR v_membership_role IS DISTINCT FROM v_expected_role
     OR v_membership_role NOT IN ('consultoria_admin', 'sst_tst') THEN
    RAISE EXCEPTION 'authorization denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT o.tenant_id, o.id
      FROM third_party_evidence_candidate.private_file_objects AS o
     WHERE o.tenant_id = v_tenant_id
     ORDER BY o.id;
END
$function$;
ALTER FUNCTION third_party_legacy_reconciliation_candidate.list_registered_private_file_objects()
  OWNER TO third_party_legacy_reconciliation_candidate_executor;
REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate
  FROM third_party_legacy_reconciliation_candidate_executor;
REVOKE ALL ON FUNCTION third_party_legacy_reconciliation_candidate.list_registered_private_file_objects()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION third_party_legacy_reconciliation_candidate.list_registered_private_file_objects()
  TO sst_hoje_app;
GRANT USAGE ON SCHEMA third_party_legacy_reconciliation_candidate TO sst_hoje_app;
