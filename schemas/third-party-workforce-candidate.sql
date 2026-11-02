-- M22 candidate only. Not a migration; do not apply to an active database.
-- Depends on sst.tenants, sst.tenant_memberships, the third_parties and
-- third_party_cases relations from operational-authority-grants-candidate.sql,
-- and document_versions from third-party-evidence-candidate.sql.
-- This candidate contains no ASO content, clinical data, or medical decision.

CREATE SCHEMA third_party_workforce_candidate;
CREATE ROLE third_party_workforce_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Case-specific declaration/review. A contractor may have different staffing
-- arrangements in different client scopes; do not infer from MEI status alone.
CREATE TABLE third_party_workforce_candidate.case_workforce_context_versions (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  legal_form text NOT NULL CHECK (legal_form IN ('mei','other','unconfirmed')),
  execution_model text NOT NULL CHECK (execution_model IN ('owner_only','owner_with_employees','employee_only','unconfirmed')),
  pgr_document_state text NOT NULL CHECK (pgr_document_state IN ('required','dispensed_mei','not_assessed')),
  review_state text NOT NULL CHECK (review_state IN ('draft','confirmed','rejected','superseded')),
  classification_basis text NOT NULL CHECK (classification_basis IN ('self_declaration','registration_document','other_reviewed_source','not_reviewed')),
  source_document_version_id uuid,
  source_document_kind text CHECK (source_document_kind IN ('COMPANY_REGISTRATION','OTHER')),
  revision integer NOT NULL CHECK (revision > 0),
  replaces_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_by text,
  reviewed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id,workflow_id),
  UNIQUE (tenant_id,workflow_id,revision),
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,reviewed_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,source_document_version_id,third_party_id,source_document_kind)
    REFERENCES third_party_evidence_candidate.document_versions(tenant_id,id,third_party_id,document_kind) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,replaces_id,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES third_party_workforce_candidate.case_workforce_context_versions(tenant_id,id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT,
  CHECK ((revision = 1 AND replaces_id IS NULL) OR (revision > 1 AND replaces_id IS NOT NULL)),
  CHECK ((review_state = 'draft' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
         (review_state IN ('confirmed','rejected','superseded') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (review_state NOT IN ('confirmed','superseded') OR classification_basis <> 'not_reviewed'),
  CHECK ((classification_basis = 'registration_document' AND source_document_version_id IS NOT NULL AND source_document_kind = 'COMPANY_REGISTRATION') OR
         (classification_basis = 'other_reviewed_source' AND source_document_version_id IS NOT NULL) OR
         (classification_basis IN ('self_declaration','not_reviewed') AND source_document_version_id IS NULL AND source_document_kind IS NULL)),
  CHECK (pgr_document_state <> 'dispensed_mei' OR (legal_form = 'mei' AND review_state IN ('confirmed','superseded')))
);

CREATE UNIQUE INDEX case_workforce_context_one_current_idx
  ON third_party_workforce_candidate.case_workforce_context_versions(tenant_id,workflow_id)
  WHERE review_state = 'confirmed';
CREATE UNIQUE INDEX case_workforce_context_one_draft_idx
  ON third_party_workforce_candidate.case_workforce_context_versions(tenant_id,workflow_id)
  WHERE review_state = 'draft';

CREATE TABLE third_party_workforce_candidate.workers (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  third_party_id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('active','inactive')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,third_party_id),
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Function/job title is scoped to a specific client service, not a global role.
-- A worker can have distinct assignments at distinct clients or scopes.
CREATE TABLE third_party_workforce_candidate.worker_case_assignments (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  relationship_to_contractor text NOT NULL CHECK (relationship_to_contractor IN ('owner','employee','other','unconfirmed')),
  job_title text NOT NULL CHECK (length(trim(job_title)) BETWEEN 1 AND 160),
  status text NOT NULL CHECK (status IN ('active','ended')),
  starts_on date NOT NULL,
  ends_on date,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,worker_id,workflow_id),
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,worker_id,third_party_id)
    REFERENCES third_party_workforce_candidate.workers(tenant_id,id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK ((status = 'active' AND ends_on IS NULL) OR status = 'ended')
);

CREATE UNIQUE INDEX worker_case_one_active_assignment_idx
  ON third_party_workforce_candidate.worker_case_assignments(tenant_id,workflow_id,worker_id)
  WHERE status = 'active';

CREATE TABLE third_party_workforce_candidate.worker_assignment_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','updated','ended')),
  actor_user_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  change_summary text NOT NULL CHECK (length(trim(change_summary)) BETWEEN 1 AND 1200),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id)
    REFERENCES third_party_workforce_candidate.worker_case_assignments(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Tenant RLS is defense in depth. No direct table/function privileges are
-- granted to the candidate role. ASO/medical access requires a separate design
-- and trusted server-side authorization path before any evidence is stored.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'case_workforce_context_versions','workers','worker_case_assignments','worker_assignment_events'
  ] LOOP
    EXECUTE format('ALTER TABLE third_party_workforce_candidate.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE third_party_workforce_candidate.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON third_party_workforce_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''sst.tenant_id'',true))',table_name);
  END LOOP;
END $$;

CREATE FUNCTION third_party_workforce_candidate.reject_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Worker assignment history is append-only.';
END $$;
CREATE TRIGGER worker_assignment_events_immutable
  BEFORE UPDATE OR DELETE ON third_party_workforce_candidate.worker_assignment_events
  FOR EACH ROW EXECUTE FUNCTION third_party_workforce_candidate.reject_event_mutation();
CREATE TRIGGER worker_assignment_events_no_truncate
  BEFORE TRUNCATE ON third_party_workforce_candidate.worker_assignment_events
  FOR EACH STATEMENT EXECUTE FUNCTION third_party_workforce_candidate.reject_event_mutation();

REVOKE ALL ON ALL TABLES IN SCHEMA third_party_workforce_candidate FROM PUBLIC,third_party_workforce_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA third_party_workforce_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA third_party_workforce_candidate TO third_party_workforce_candidate_app;
-- No direct DML/SELECT or trusted functions yet; parse, RLS, grants, immutability,
-- medical separation, and the deduplication/encryption strategy require review
-- and disposable PostgreSQL proof before any runtime integration.
-- Trusted transaction functions must also reconcile the confirmed case context
-- with worker assignments (owner_only => exactly one active owner and no active
-- employees; owner_with_employees => owner plus at least one employee;
-- employee_only => at least one employee and no owner assignment), validate
-- membership/role and source evidence, and supersede revisions atomically.
-- These cross-row invariants are intentionally not claimed by this DDL alone.
