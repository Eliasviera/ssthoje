-- M22 candidate only. Not a migration. Do not apply to an active database.
-- Depends on operational_authority_candidate and third_party_evidence_candidate.
-- This is provenance/reconciliation metadata only; it does not copy PDF bytes,
-- make JSON operational, or define medical/ASO handling.

CREATE SCHEMA third_party_legacy_reconciliation_candidate;
CREATE ROLE third_party_legacy_reconciliation_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Immutable identity and facts captured from one legacy receipt. The composite
-- source key is opaque and idempotent; no filename/path is persisted here.
CREATE TABLE third_party_legacy_reconciliation_candidate.legacy_receipts (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_store text NOT NULL CHECK (source_store IN ('third-party-json')),
  source_invitation_id text NOT NULL CHECK (length(trim(source_invitation_id)) BETWEEN 1 AND 180),
  source_receipt_id text NOT NULL CHECK (length(trim(source_receipt_id)) BETWEEN 1 AND 180),
  source_kind text NOT NULL CHECK (source_kind IN
    ('PGR','PCMSO','LTCAT','Ficha de EPI','Treinamento','O.S.','Outro')),
  source_file_name text NOT NULL CHECK (length(trim(source_file_name)) BETWEEN 1 AND 180),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  source_received_at timestamptz NOT NULL,
  source_valid_until date,
  source_replaces_receipt_id text,
  private_file_object_id uuid,
  imported_by text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source_store,source_invitation_id,source_receipt_id),
  UNIQUE (tenant_id,id,source_kind),
  FOREIGN KEY (tenant_id,imported_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,private_file_object_id,content_sha256,byte_size)
    REFERENCES third_party_evidence_candidate.private_file_objects(tenant_id,id,content_sha256,byte_size) ON DELETE RESTRICT,
  CHECK (source_replaces_receipt_id IS NULL OR
         length(trim(source_replaces_receipt_id)) BETWEEN 1 AND 180)
);
COMMENT ON COLUMN third_party_legacy_reconciliation_candidate.legacy_receipts.source_valid_until IS
  'Validade declarada no recibo legado; NULL quando ausente. A data não comprova autenticidade nem conformidade.';
COMMENT ON COLUMN third_party_legacy_reconciliation_candidate.legacy_receipts.private_file_object_id IS
  'Objeto privado copiado e relido antes da captura; NULL somente em fatos legados ainda não copiados.';

-- Minimal immutable snapshot of invitation context. This captures only opaque
-- source IDs and fields useful for review; never persist names, token hashes,
-- invitation credentials, local paths, or PDF bytes here.
CREATE TABLE third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_store text NOT NULL CHECK (source_store IN ('third-party-json')),
  source_invitation_id text NOT NULL CHECK (length(trim(source_invitation_id)) BETWEEN 1 AND 180),
  revision integer NOT NULL CHECK (revision > 0),
  source_company_id text,
  source_unit_id text,
  contractor_cnpj text CHECK (contractor_cnpj IS NULL OR length(trim(contractor_cnpj)) BETWEEN 1 AND 32),
  scope_text text,
  requested_categories text[] NOT NULL CHECK (cardinality(requested_categories)>0 AND requested_categories <@ ARRAY['PGR','PCMSO','LTCAT','Ficha de EPI','Treinamento','O.S.','Outro']::text[]),
  context_sha256 text NOT NULL CHECK (context_sha256 ~ '^[a-f0-9]{64}$'),
  captured_by text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source_store,source_invitation_id,revision),
  UNIQUE (tenant_id,id,source_store,source_invitation_id,context_sha256),
  FOREIGN KEY (tenant_id,captured_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Human-confirmed invitation-to-case relationship, versioned as an append-only
-- event stream. Distinct invitations remain distinct even when linked to one case.
CREATE TABLE third_party_legacy_reconciliation_candidate.invitation_case_link_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_store text NOT NULL,
  source_invitation_id text NOT NULL,
  snapshot_id uuid NOT NULL,
  context_sha256 text NOT NULL CHECK (context_sha256 ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  event_type text NOT NULL CHECK (event_type IN ('pending','proposed','linked','ambiguous','rejected','unavailable','reopened')),
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 1600),
  actor_user_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source_store,source_invitation_id,revision),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id,workflow_id),
  FOREIGN KEY (tenant_id,snapshot_id,source_store,source_invitation_id,context_sha256)
    REFERENCES third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots(tenant_id,id,source_store,source_invitation_id,context_sha256) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  CHECK (
    (event_type IN ('proposed','linked') AND company_id IS NOT NULL AND unit_id IS NOT NULL AND third_party_id IS NOT NULL AND workflow_id IS NOT NULL) OR
    (event_type NOT IN ('proposed','linked') AND company_id IS NULL AND unit_id IS NULL AND third_party_id IS NULL AND workflow_id IS NULL)
  )
);
-- Append-only review history. Unresolved events have no target. A match must
-- name an exact case and document version of the same third party and kind.
CREATE TABLE third_party_legacy_reconciliation_candidate.reconciliation_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_receipt_id uuid NOT NULL,
  source_kind text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  event_type text NOT NULL CHECK (event_type IN
    ('pending','matched','ambiguous','rejected','unavailable','reopened')),
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  document_series_id uuid,
  document_version_id uuid,
  invitation_case_link_event_id uuid,
  target_document_kind text CHECK (target_document_kind IN
    ('COMPANY_REGISTRATION','PGR','PCMSO','LTCAT','OTHER')),
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 1600),
  actor_user_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,legacy_receipt_id,revision),
  FOREIGN KEY (tenant_id,legacy_receipt_id,source_kind)
    REFERENCES third_party_legacy_reconciliation_candidate.legacy_receipts(tenant_id,id,source_kind) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,invitation_case_link_event_id,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES third_party_legacy_reconciliation_candidate.invitation_case_link_events(tenant_id,id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,document_version_id,document_series_id,third_party_id,target_document_kind)
    REFERENCES third_party_evidence_candidate.document_versions(tenant_id,id,series_id,third_party_id,document_kind) ON DELETE RESTRICT,
  CHECK (
    (event_type='matched' AND company_id IS NOT NULL AND unit_id IS NOT NULL AND
      third_party_id IS NOT NULL AND workflow_id IS NOT NULL AND
      document_series_id IS NOT NULL AND document_version_id IS NOT NULL AND
      invitation_case_link_event_id IS NOT NULL AND target_document_kind IS NOT NULL AND
      ((source_kind IN ('PGR','PCMSO','LTCAT') AND source_kind=target_document_kind) OR
       (source_kind='Outro' AND target_document_kind='OTHER'))) OR
    (event_type<>'matched' AND company_id IS NULL AND unit_id IS NULL AND
      third_party_id IS NULL AND workflow_id IS NULL AND
      document_series_id IS NULL AND document_version_id IS NULL AND invitation_case_link_event_id IS NULL AND
      target_document_kind IS NULL)
  ),
  CHECK (event_type<>'ambiguous' OR length(trim(rationale))>0)
);

-- Guard against accidental mutation of the provenance and review history.
CREATE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legacy receipt provenance and reconciliation events are append-only';
END;
$$;

CREATE TRIGGER legacy_invitation_snapshots_immutable
  BEFORE UPDATE OR DELETE ON third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
  FOR EACH ROW EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER invitation_case_link_events_immutable
  BEFORE UPDATE OR DELETE ON third_party_legacy_reconciliation_candidate.invitation_case_link_events
  FOR EACH ROW EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER legacy_receipts_immutable
  BEFORE UPDATE OR DELETE ON third_party_legacy_reconciliation_candidate.legacy_receipts
  FOR EACH ROW EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER reconciliation_events_immutable
  BEFORE UPDATE OR DELETE ON third_party_legacy_reconciliation_candidate.reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER legacy_invitation_snapshots_no_truncate
  BEFORE TRUNCATE ON third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER invitation_case_link_events_no_truncate
  BEFORE TRUNCATE ON third_party_legacy_reconciliation_candidate.invitation_case_link_events
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER legacy_receipts_no_truncate
  BEFORE TRUNCATE ON third_party_legacy_reconciliation_candidate.legacy_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();
CREATE TRIGGER reconciliation_events_no_truncate
  BEFORE TRUNCATE ON third_party_legacy_reconciliation_candidate.reconciliation_events
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_legacy_reconciliation_candidate.reject_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['legacy_receipts','legacy_invitation_snapshots','invitation_case_link_events','reconciliation_events'] LOOP
    EXECUTE format('ALTER TABLE third_party_legacy_reconciliation_candidate.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE third_party_legacy_reconciliation_candidate.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON third_party_legacy_reconciliation_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''sst.tenant_id'',true))',table_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA third_party_legacy_reconciliation_candidate FROM PUBLIC,third_party_legacy_reconciliation_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA third_party_legacy_reconciliation_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA third_party_legacy_reconciliation_candidate TO third_party_legacy_reconciliation_candidate_app;

-- The candidate capture function stores only facts supplied by a trusted
-- reread/hash step; it cannot verify bytes or private-object storage. The
-- reconciliation function separately validates current invitation/case links,
-- target document versions and replacement chains. No direct app DML/SELECT
-- is granted. A private-object binding and source reread orchestration remain
-- prerequisites to any runtime integration. ASO and worker-specific receipts
-- have no target path in this schema.


