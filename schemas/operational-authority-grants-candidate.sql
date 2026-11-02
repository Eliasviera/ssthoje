-- M22 candidate only. Never add this file to the migration runner or apply to
-- an active database. PostgreSQL disposable proof is required first.
-- Dependencies: migrations 0001, 0004 and 0005:
-- sst.tenants, sst.tenant_memberships, sst.client_companies,
-- sst.client_units(tenant_id,id,company_id) unique key.
-- Third-party/case identifiers are defined below in this candidate schema.
-- Requires PostgreSQL 13+ for built-in gen_random_uuid(); no extension needed.

CREATE SCHEMA operational_authority_candidate;
CREATE ROLE operational_authority_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

CREATE TABLE operational_authority_candidate.third_parties (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cnpj text NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 1 AND 240),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,cnpj),
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Stable case identity; invitation IDs remain separate and may repeat in a case.
CREATE TABLE operational_authority_candidate.third_party_cases (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  work_scope text NOT NULL CHECK (length(trim(work_scope)) BETWEEN 1 AND 1000),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id),
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

-- Global, versioned allowlist; tenants cannot add action codes.
CREATE TABLE operational_authority_candidate.action_catalog (
  catalog_version integer NOT NULL CHECK (catalog_version > 0),
  action_code text NOT NULL,
  authority_track text NOT NULL CHECK (authority_track IN
    ('platform','administrative','technical_recommendation','technical_authority','policy_administration',
     'managerial_decision','workflow_routing','evidence_submission','read_only')),
  principal_kind text NOT NULL CHECK (principal_kind IN ('human','machine','either')),
  requires_company boolean NOT NULL,
  requires_unit boolean NOT NULL,
  requires_third_party boolean NOT NULL,
  requires_workflow boolean NOT NULL,
  policy_required boolean NOT NULL DEFAULT false,
  allow_tenant_wide_scope boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (catalog_version,action_code),
  CHECK (NOT requires_unit OR requires_company),
  CHECK (NOT (authority_track IN ('technical_recommendation','technical_authority',
    'managerial_decision','workflow_routing') AND allow_tenant_wide_scope))
);

CREATE TABLE operational_authority_candidate.role_presets (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  preset_code text NOT NULL CHECK (length(trim(preset_code)) BETWEEN 1 AND 80),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  revision integer NOT NULL CHECK (revision > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,preset_code,revision),
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id)
);

CREATE TABLE operational_authority_candidate.role_preset_actions (
  tenant_id text NOT NULL,
  preset_id uuid NOT NULL,
  catalog_version integer NOT NULL,
  action_code text NOT NULL,
  PRIMARY KEY (tenant_id,preset_id,catalog_version,action_code),
  FOREIGN KEY (tenant_id,preset_id)
    REFERENCES operational_authority_candidate.role_presets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (catalog_version,action_code)
    REFERENCES operational_authority_candidate.action_catalog(catalog_version,action_code)
);

-- One immutable row per human principal + action + exact scope. Revocation is
-- represented by a later grant_event, never by updating this row.
CREATE TABLE operational_authority_candidate.authority_grants (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  principal_user_id text NOT NULL,
  catalog_version integer NOT NULL,
  action_code text NOT NULL,
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  preset_id uuid,
  grant_base_id uuid,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,action_code),
  FOREIGN KEY (tenant_id,principal_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,granted_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (catalog_version,action_code)
    REFERENCES operational_authority_candidate.action_catalog(catalog_version,action_code),
  FOREIGN KEY (tenant_id,preset_id)
    REFERENCES operational_authority_candidate.role_presets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,grant_base_id)
    REFERENCES operational_authority_candidate.authority_grants(tenant_id,id) ON DELETE RESTRICT,
  CHECK ((unit_id IS NULL AND company_id IS NULL) OR (unit_id IS NOT NULL AND company_id IS NOT NULL)),
  CHECK (workflow_id IS NULL OR (third_party_id IS NOT NULL AND company_id IS NOT NULL AND unit_id IS NOT NULL)),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (grant_base_id IS NULL OR grant_base_id <> id)
);

CREATE TABLE operational_authority_candidate.grant_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('issued','revoked')),
  actor_user_id text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,grant_id)
    REFERENCES operational_authority_candidate.authority_grants(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_issue_event_per_grant
  ON operational_authority_candidate.grant_events(tenant_id,grant_id)
  WHERE event_type='issued';
CREATE UNIQUE INDEX one_revocation_event_per_grant
  ON operational_authority_candidate.grant_events(tenant_id,grant_id)
  WHERE event_type='revoked';

-- Client-designated registrars are separate from consultancy tenant admins.
CREATE TABLE operational_authority_candidate.client_registrars (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  designated_by text NOT NULL,
  designation_reference text NOT NULL CHECK (length(trim(designation_reference)) BETWEEN 1 AND 240),
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id),
  FOREIGN KEY (tenant_id,user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,designated_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE TABLE operational_authority_candidate.registrar_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registrar_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('proposed','designated','revoked')),
  actor_user_id text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,registrar_id)
    REFERENCES operational_authority_candidate.client_registrars(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_registrar_designation_event
  ON operational_authority_candidate.registrar_events(tenant_id,registrar_id)
  WHERE event_type='designated';
CREATE UNIQUE INDEX one_registrar_revocation_event
  ON operational_authority_candidate.registrar_events(tenant_id,registrar_id)
  WHERE event_type='revoked';

-- Client-side authority for the exact company/unit is recorded separately
-- from the consultancy administrator who technically inserts a grant.
-- Trusted functions must revalidate registrar status and scope.
ALTER TABLE operational_authority_candidate.authority_grants
  ADD COLUMN authorized_by_registrar_id uuid;
ALTER TABLE operational_authority_candidate.authority_grants
  ADD CONSTRAINT authority_grant_client_registrar_fk
  FOREIGN KEY (tenant_id,authorized_by_registrar_id,company_id,unit_id)
  REFERENCES operational_authority_candidate.client_registrars(tenant_id,id,company_id,unit_id)
  ON DELETE RESTRICT;

CREATE TABLE operational_authority_candidate.analyst_assignments (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  analyst_user_id text NOT NULL,
  assignment_kind text NOT NULL CHECK (assignment_kind IN ('client_sst','consultancy_sst')),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  qualification_status text NOT NULL CHECK (qualification_status IN ('unverified','verified','expired')),
  qualification_reference text,
  authorized_by_registrar_id uuid,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id,workflow_id),
  UNIQUE (tenant_id,id,analyst_user_id,company_id,unit_id,third_party_id,workflow_id),
  FOREIGN KEY (tenant_id,analyst_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,authorized_by_registrar_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.client_registrars(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (authorized_by_registrar_id IS NOT NULL),
  CHECK ((qualification_status='verified' AND qualification_reference IS NOT NULL) OR
         qualification_status<>'verified')
);
CREATE TABLE operational_authority_candidate.assignment_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('assigned','revoked')),
  actor_user_id text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id)
    REFERENCES operational_authority_candidate.analyst_assignments(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_assignment_issue_event
  ON operational_authority_candidate.assignment_events(tenant_id,assignment_id)
  WHERE event_type='assigned';
CREATE UNIQUE INDEX one_assignment_revocation_event
  ON operational_authority_candidate.assignment_events(tenant_id,assignment_id)
  WHERE event_type='revoked';

CREATE TABLE operational_authority_candidate.policy_requirement_catalog (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9._-]{1,79}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,company_id,unit_id,requirement_code),
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE operational_authority_candidate.policy_versions (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  effective_at timestamptz NOT NULL,
  published_by text NOT NULL,
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL,
  authorized_by_registrar_id uuid,
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,company_id,unit_id,version),
  UNIQUE (tenant_id,company_id,unit_id,effective_at),
  UNIQUE (tenant_id,id,company_id,unit_id),
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,reviewed_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,published_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,authorized_by_registrar_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.client_registrars(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  CHECK (reviewed_at <= effective_at)
);
CREATE TABLE operational_authority_candidate.policy_items (
  tenant_id text NOT NULL,
  policy_version_id uuid NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  requirement_code text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('recommendation','requirement','block','conditional_allowed')),
  reference_snapshot jsonb NOT NULL,
  evidence_rule_snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id,policy_version_id,requirement_code),
  FOREIGN KEY (tenant_id,policy_version_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.policy_versions(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id,unit_id,requirement_code)
    REFERENCES operational_authority_candidate.policy_requirement_catalog(tenant_id,company_id,unit_id,requirement_code) ON DELETE RESTRICT
);

-- Immutable human assessment snapshot. Technical state is per policy item;
-- aggregation/eligibility is calculated by a trusted transaction function.
CREATE TABLE operational_authority_candidate.technical_assessments (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  assessment_revision integer NOT NULL CHECK (assessment_revision > 0),
  source_contract_version integer NOT NULL DEFAULT 2 CHECK (source_contract_version > 0),
  assessed_by text NOT NULL,
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 4000),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,company_id,unit_id,third_party_id,workflow_id),
  UNIQUE (tenant_id,id,policy_version_id),
  UNIQUE (tenant_id,id,policy_version_id,company_id,unit_id,third_party_id,workflow_id),
  UNIQUE (tenant_id,company_id,unit_id,third_party_id,workflow_id,assessment_revision),
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,policy_version_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.policy_versions(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,assignment_id,assessed_by,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES operational_authority_candidate.analyst_assignments(tenant_id,id,analyst_user_id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT
);

CREATE TABLE operational_authority_candidate.technical_assessment_items (
  tenant_id text NOT NULL,
  assessment_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  requirement_code text NOT NULL,
  technical_state text NOT NULL CHECK (technical_state IN
    ('not_assessed','insufficient_evidence','nonconforming','conforming','not_applicable')),
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 4000),
  PRIMARY KEY (tenant_id,assessment_id,requirement_code),
  FOREIGN KEY (tenant_id,assessment_id,policy_version_id)
    REFERENCES operational_authority_candidate.technical_assessments(tenant_id,id,policy_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,policy_version_id,requirement_code)
    REFERENCES operational_authority_candidate.policy_items(tenant_id,policy_version_id,requirement_code) ON DELETE RESTRICT
);

-- Case-level dependency snapshots match the existing candidate source
-- manifest groups; they do not claim which source proves which requirement.
CREATE TABLE operational_authority_candidate.technical_assessment_sources (
  tenant_id text NOT NULL,
  assessment_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('documents','requirements','evaluations','policies','criteria')),
  source_id text NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id,assessment_id,source_kind,source_id,source_revision),
  UNIQUE (tenant_id,assessment_id,source_kind),
  FOREIGN KEY (tenant_id,assessment_id)
    REFERENCES operational_authority_candidate.technical_assessments(tenant_id,id) ON DELETE RESTRICT
);

-- Exact members of each extracted group. The trusted repository populates this
-- list from the same transaction and verifies the group's canonical digest.
CREATE TABLE operational_authority_candidate.technical_assessment_source_members (
  tenant_id text NOT NULL,
  assessment_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('documents','requirements','evaluations','criteria')),
  snapshot_source_id text NOT NULL,
  snapshot_source_revision integer NOT NULL CHECK (snapshot_source_revision > 0),
  member_source_id text NOT NULL CHECK (length(trim(member_source_id)) BETWEEN 1 AND 240),
  member_source_revision integer NOT NULL CHECK (member_source_revision > 0),
  member_source_fingerprint text NOT NULL CHECK (member_source_fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision,member_source_id,member_source_revision),
  UNIQUE (tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision,member_source_id,member_source_revision,member_source_fingerprint),
  FOREIGN KEY (tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision)
    REFERENCES operational_authority_candidate.technical_assessment_sources(tenant_id,assessment_id,source_kind,source_id,source_revision) ON DELETE RESTRICT
);

-- Per-requirement citations. The snapshot FK proves the cited group was captured
-- for this assessment and that the cited reference is one of its stored members.
CREATE TABLE operational_authority_candidate.technical_assessment_item_sources (
  tenant_id text NOT NULL,
  assessment_id uuid NOT NULL,
  requirement_code text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('documents','requirements','evaluations','criteria')),
  snapshot_source_id text NOT NULL,
  snapshot_source_revision integer NOT NULL CHECK (snapshot_source_revision > 0),
  referenced_source_id text NOT NULL CHECK (length(trim(referenced_source_id)) BETWEEN 1 AND 240),
  referenced_source_revision integer NOT NULL CHECK (referenced_source_revision > 0),
  referenced_source_fingerprint text NOT NULL CHECK (referenced_source_fingerprint ~ '^[a-f0-9]{64}$'),
  reference_role text NOT NULL CHECK (reference_role IN
    ('evidence','applicability_basis','prior_evaluation','criterion')),
  PRIMARY KEY (tenant_id,assessment_id,requirement_code,source_kind,referenced_source_id,referenced_source_revision,reference_role),
  FOREIGN KEY (tenant_id,assessment_id,requirement_code)
    REFERENCES operational_authority_candidate.technical_assessment_items(tenant_id,assessment_id,requirement_code) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint)
    REFERENCES operational_authority_candidate.technical_assessment_source_members(tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision,member_source_id,member_source_revision,member_source_fingerprint) ON DELETE RESTRICT,
  CHECK ((source_kind='documents' AND reference_role='evidence') OR
         (source_kind='requirements' AND reference_role='applicability_basis') OR
         (source_kind='evaluations' AND reference_role='prior_evaluation') OR
         (source_kind='criteria' AND reference_role='criterion'))
);

CREATE TABLE operational_authority_candidate.decisions (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action_code text NOT NULL,
  actor_user_id text NOT NULL,
  grant_id uuid NOT NULL,
  technical_assessment_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  third_party_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN
    ('require_pre_entry_correction','conditional_entry','return_to_sst','technical_block','technical_release')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 4000),
  plan_snapshot jsonb,
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,grant_id)
    REFERENCES operational_authority_candidate.authority_grants(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,technical_assessment_id,policy_version_id,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES operational_authority_candidate.technical_assessments(tenant_id,id,policy_version_id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,policy_version_id,company_id,unit_id)
    REFERENCES operational_authority_candidate.policy_versions(tenant_id,id,company_id,unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,grant_id,action_code)
    REFERENCES operational_authority_candidate.authority_grants(tenant_id,id,action_code) DEFERRABLE INITIALLY DEFERRED,
  CHECK (outcome<>'conditional_entry' OR plan_snapshot IS NOT NULL)
);
CREATE TABLE operational_authority_candidate.decision_sources (
  tenant_id text NOT NULL,
  decision_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('documents','requirements','evaluations','policies','criteria')),
  source_id text NOT NULL CHECK (length(trim(source_id)) > 0),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id,decision_id,source_kind,source_id,source_revision),
  FOREIGN KEY (tenant_id,decision_id)
    REFERENCES operational_authority_candidate.decisions(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE operational_authority_candidate.audit_events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id text,
  actor_application_id text,
  action_code text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('allowed','denied')),
  grant_id uuid,
  assignment_id uuid,
  technical_assessment_id uuid,
  policy_version_id uuid,
  company_id text,
  unit_id text,
  third_party_id uuid,
  workflow_id uuid,
  reason_code text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,actor_user_id)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,grant_id)
    REFERENCES operational_authority_candidate.authority_grants(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,assignment_id)
    REFERENCES operational_authority_candidate.analyst_assignments(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,technical_assessment_id,policy_version_id,company_id,unit_id,third_party_id,workflow_id)
    REFERENCES operational_authority_candidate.technical_assessments(tenant_id,id,policy_version_id,company_id,unit_id,third_party_id,workflow_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,policy_version_id)
    REFERENCES operational_authority_candidate.policy_versions(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,third_party_id)
    REFERENCES operational_authority_candidate.third_parties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,workflow_id,company_id,unit_id,third_party_id)
    REFERENCES operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id) ON DELETE RESTRICT,
  CHECK ((actor_user_id IS NOT NULL AND actor_application_id IS NULL) OR
         (actor_user_id IS NULL AND actor_application_id IS NOT NULL)),
  CHECK (technical_assessment_id IS NULL OR
         (policy_version_id IS NOT NULL AND company_id IS NOT NULL AND unit_id IS NOT NULL
          AND third_party_id IS NOT NULL AND workflow_id IS NOT NULL))
);

-- Tenant isolation; global action catalog is managed only by trusted release.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'third_parties','third_party_cases','role_presets','role_preset_actions','authority_grants','grant_events',
    'client_registrars','registrar_events','analyst_assignments','assignment_events',
    'policy_requirement_catalog','policy_versions','policy_items','technical_assessments','technical_assessment_items',
    'technical_assessment_sources','technical_assessment_source_members','technical_assessment_item_sources','decisions','decision_sources','audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE operational_authority_candidate.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE operational_authority_candidate.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON operational_authority_candidate.%I USING (tenant_id=current_setting(''sst.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''sst.tenant_id'',true))',table_name);
  END LOOP;
END $$;
ALTER TABLE operational_authority_candidate.action_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_authority_candidate.action_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY action_catalog_read ON operational_authority_candidate.action_catalog
  USING (enabled=true) WITH CHECK (false);

-- Protect issued permissions, policy versions, decisions and event history
-- even if a future SECURITY DEFINER function receives overly broad rights.
CREATE FUNCTION operational_authority_candidate.reject_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Candidate history is append-only.';
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'action_catalog','third_parties','third_party_cases','role_presets','role_preset_actions','authority_grants','grant_events',
    'client_registrars','registrar_events','analyst_assignments','assignment_events',
    'policy_requirement_catalog','policy_versions','policy_items','technical_assessments','technical_assessment_items',
    'technical_assessment_sources','technical_assessment_source_members','technical_assessment_item_sources','decisions','decision_sources','audit_events'
  ] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON operational_authority_candidate.%I FOR EACH ROW EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation()',table_name);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON operational_authority_candidate.%I FOR EACH STATEMENT EXECUTE FUNCTION operational_authority_candidate.reject_immutable_mutation()',table_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA operational_authority_candidate FROM PUBLIC,operational_authority_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA operational_authority_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA operational_authority_candidate TO operational_authority_candidate_app;
-- No direct DML or EXECUTE grants yet. Add reviewed server-side functions only
-- after disposable PostgreSQL proof and privilege/RLS review.
-- Remaining design/proof work: seed the reviewed action-catalog version;
-- enforce catalog-required scope dimensions and grant-base ceiling/cycle checks
-- in trusted functions; prove designation provenance for client_registrars;
-- create trusted third-party/case/requirement records and map existing invitations
-- without automatic merges; connect machine actor IDs to application_principals;
-- and serialize duplicate active
-- grants and ancestor revocation against action use. Membership suspension
-- also needs a system-actor/event model (or authority-generation invalidation):
-- current event actor_user_id fields correctly require a human membership and
-- must not be falsified by an automated revocation. This DDL alone is not an
-- authorization implementation. Technical assessment sources still have
-- opaque references until the authoritative third-party evidence/workflow
-- tables are selected; trusted functions must enforce complete policy-item
-- coverage, one current assessment per fingerprint and authorization at use.
-- Item citations now reference exact stored members of an assessment snapshot.
-- A trusted repository must populate the member list from its locked extraction
-- and verify its canonical digest; state-dependent completeness also remains
-- a trusted-function rule.
