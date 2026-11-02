-- M22 candidate only. Not a migration; never apply to an active database.
-- Depends on sst.tenants, sst.tenant_memberships, and
-- operational_authority_candidate.third_parties / third_party_cases.
-- Contains organization-level nonmedical documents only. ASO and worker files
-- require a separately authorized medical/workforce model.

CREATE SCHEMA third_party_evidence_candidate;
CREATE ROLE third_party_evidence_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Opaque private-file registry. backend_code/object_locator are server-only
-- references, not client paths or public URLs. This schema does not select a
-- provider or implement byte transfer, encryption, scanning, or retention.
CREATE TABLE third_party_evidence_candidate.private_file_objects (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  backend_code text NOT NULL CHECK (length(trim(backend_code)) BETWEEN 1 AND 80),
  object_locator text NOT NULL CHECK (length(trim(object_locator)) BETWEEN 1 AND 500),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  registered_by text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,content_sha256,byte_size),
  UNIQUE (tenant_id,backend_code,object_locator),
  FOREIGN KEY (tenant_id,registered_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Availability/verification is append-only; latest-event interpretation and
-- allowed transitions belong to trusted server functions under a row lock.
CREATE TABLE third_party_evidence_candidate.private_file_object_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('verified','quarantined','unavailable','restored','deleted')),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  actor_user_id text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,object_id),
  FOREIGN KEY (tenant_id,object_id,content_sha256,byte_size)
    REFERENCES third_party_evidence_candidate.private_file_objects(tenant_id,id,content_sha256,byte_size) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE third_party_evidence_candidate.private_file_object_event_heads (
  tenant_id text NOT NULL,
  object_id uuid NOT NULL,
  event_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,object_id),
  FOREIGN KEY (tenant_id,object_id)
    REFERENCES third_party_evidence_candidate.private_file_objects(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,event_id,object_id)
    REFERENCES third_party_evidence_candidate.private_file_object_events(tenant_id,id,object_id) ON DELETE RESTRICT
);

CREATE FUNCTION third_party_evidence_candidate.reject_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'private file object registry and events are append-only';
END;
$$;
CREATE TRIGGER private_file_objects_immutable
  BEFORE UPDATE OR DELETE ON third_party_evidence_candidate.private_file_objects
  FOR EACH ROW EXECUTE FUNCTION third_party_evidence_candidate.reject_immutable_mutation();
CREATE TRIGGER private_file_object_events_immutable
  BEFORE UPDATE OR DELETE ON third_party_evidence_candidate.private_file_object_events
  FOR EACH ROW EXECUTE FUNCTION third_party_evidence_candidate.reject_immutable_mutation();
CREATE TRIGGER private_file_objects_no_truncate
  BEFORE TRUNCATE ON third_party_evidence_candidate.private_file_objects
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_evidence_candidate.reject_immutable_mutation();
CREATE TRIGGER private_file_object_events_no_truncate
  BEFORE TRUNCATE ON third_party_evidence_candidate.private_file_object_events
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_evidence_candidate.reject_immutable_mutation();

-- Stable document series per contractor. A series can be evaluated for several
-- client cases; each file revision is a separate row below.
CREATE TABLE third_party_evidence_candidate.document_series (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  third_party_id uuid NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN
    ('COMPANY_REGISTRATION','PGR','PCMSO','LTCAT','OTHER')),
  display_label text NOT NULL CHECK (length(trim(display_label)) BETWEEN 1 AND 160),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,third_party_id,document_kind),
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE third_party_evidence_candidate.document_versions (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL,
  third_party_id uuid NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN
    ('COMPANY_REGISTRATION','PGR','PCMSO','LTCAT','OTHER')),
  revision integer NOT NULL CHECK (revision > 0),
  storage_object_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  received_by text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  declared_valid_until date,
  state text NOT NULL CHECK (state IN ('current','superseded','withdrawn')),
  replaces_version_id uuid,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,series_id,third_party_id,document_kind),
  UNIQUE (tenant_id,id,third_party_id,document_kind),
  UNIQUE (tenant_id,series_id,revision),
  FOREIGN KEY (tenant_id,series_id,third_party_id,document_kind)
    REFERENCES third_party_evidence_candidate.document_series(tenant_id,id,third_party_id,document_kind) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,replaces_version_id,series_id,third_party_id,document_kind)
    REFERENCES third_party_evidence_candidate.document_versions(tenant_id,id,series_id,third_party_id,document_kind) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,storage_object_id,content_sha256,byte_size)
    REFERENCES third_party_evidence_candidate.private_file_objects(tenant_id,id,content_sha256,byte_size) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,received_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((revision = 1 AND replaces_version_id IS NULL) OR (revision > 1 AND replaces_version_id IS NOT NULL))
);

CREATE UNIQUE INDEX third_party_document_one_current_version_idx
  ON third_party_evidence_candidate.document_versions(tenant_id,series_id)
  WHERE state = 'current';

-- Human-reviewed applicability relation: one company document may be relevant
-- to multiple service cases, and each case can explicitly mark it applicable,
-- not applicable, or awaiting review. This is not the technical compliance
-- evaluation and never means the document conforms to a rule.
CREATE TABLE third_party_evidence_candidate.case_document_applicability_versions (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  series_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN
    ('COMPANY_REGISTRATION','PGR','PCMSO','LTCAT','OTHER')),
  revision integer NOT NULL CHECK (revision > 0),
  applicability text NOT NULL CHECK (applicability IN ('pending_review','applicable','not_applicable')),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 1200),
  record_state text NOT NULL CHECK (record_state IN ('current','superseded')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_by text,
  reviewed_at timestamptz,
  replaces_id uuid,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id,workflow_id),
  UNIQUE (tenant_id,workflow_id,series_id,revision),
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,document_version_id,series_id,third_party_id,document_kind)
    REFERENCES third_party_evidence_candidate.document_versions(tenant_id,id,series_id,third_party_id,document_kind) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,reviewed_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,replaces_id,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES third_party_evidence_candidate.case_document_applicability_versions(tenant_id,id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT,
  CHECK ((revision = 1 AND replaces_id IS NULL) OR (revision > 1 AND replaces_id IS NOT NULL)),
  CHECK ((applicability = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
         (applicability IN ('applicable','not_applicable') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (applicability <> 'not_applicable' OR length(trim(rationale)) > 0)
);

CREATE UNIQUE INDEX case_document_one_current_applicability_idx
  ON third_party_evidence_candidate.case_document_applicability_versions(tenant_id,workflow_id,series_id)
  WHERE record_state = 'current';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'private_file_objects','private_file_object_events','private_file_object_event_heads',
    'document_series','document_versions','case_document_applicability_versions'
  ] LOOP
    EXECUTE format('ALTER TABLE third_party_evidence_candidate.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE third_party_evidence_candidate.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON third_party_evidence_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''sst.tenant_id'',true))',table_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA third_party_evidence_candidate FROM PUBLIC,third_party_evidence_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA third_party_evidence_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA third_party_evidence_candidate TO third_party_evidence_candidate_app;
-- No direct SELECT/DML, storage adapter, OCR, or trusted functions are provided.
-- Existing JSON receipts and sst.*_snapshots are not authoritative FKs. A future
-- import must explicitly associate each legacy receipt; do not infer by CNPJ,
-- name, order, or text. The registry above is metadata only. Trusted functions
-- must verify bytes/hash/size against private storage, append object lifecycle
-- events and maintain the event-head projection atomically. Current JSON paths/
-- storageName are not private-object IDs and cannot be copied into this column.
-- No file transfer is authorized or implemented here. Lock a document series when issuing a revision,
-- and reopen applicability/technical review when its current version changes.
-- A historical applicability row may reference a superseded document version;
-- only a current review over the current document version can feed a new analysis.
