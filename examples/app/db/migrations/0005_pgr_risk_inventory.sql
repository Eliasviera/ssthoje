-- Tenant-scoped PGR inventory schema. No PGR records are imported here.

ALTER TABLE sst.client_units
  ADD CONSTRAINT client_units_tenant_id_company_unique UNIQUE (tenant_id, id, company_id);

CREATE TABLE sst.pgr_risk_inventories (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  source_draft_id text NOT NULL CHECK (length(source_draft_id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  activity_description text NOT NULL CHECK (length(activity_description) BETWEEN 1 AND 3000),
  action_plan text NOT NULL CHECK (length(action_plan) BETWEEN 1 AND 5000),
  status text NOT NULL CHECK (status IN ('draft', 'in_review', 'approved')),
  reviewer_user_id text CHECK (reviewer_user_id IS NULL OR length(reviewer_user_id) BETWEEN 1 AND 200),
  reviewer_role text CHECK (reviewer_role IS NULL OR length(reviewer_role) BETWEEN 1 AND 80),
  revision bigint NOT NULL CHECK (revision > 0),
  legacy_source jsonb CHECK (legacy_source IS NULL OR jsonb_typeof(legacy_source) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT pgr_inventory_source_draft_unique UNIQUE (tenant_id, source_draft_id),
  CONSTRAINT pgr_inventory_company_tenant_fk
    FOREIGN KEY (tenant_id, company_id)
    REFERENCES sst.client_companies (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pgr_inventory_unit_company_tenant_fk
    FOREIGN KEY (tenant_id, unit_id, company_id)
    REFERENCES sst.client_units (tenant_id, id, company_id) ON DELETE RESTRICT
);

CREATE INDEX pgr_risk_inventories_tenant_unit_idx
  ON sst.pgr_risk_inventories (tenant_id, company_id, unit_id, updated_at DESC);

CREATE TABLE sst.pgr_risk_items (
  tenant_id text NOT NULL,
  inventory_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 64),
  process text NOT NULL CHECK (length(process) <= 3000),
  activity text NOT NULL CHECK (length(activity) <= 3000),
  hazard text NOT NULL CHECK (length(hazard) <= 3000),
  source_circumstance text NOT NULL CHECK (length(source_circumstance) <= 3000),
  possible_harm text NOT NULL CHECK (length(possible_harm) <= 3000),
  exposed_groups jsonb NOT NULL CHECK (jsonb_typeof(exposed_groups) = 'array'),
  exposure_description text NOT NULL CHECK (length(exposure_description) <= 3000),
  existing_measures jsonb NOT NULL CHECK (jsonb_typeof(existing_measures) = 'array'),
  evidence_refs jsonb NOT NULL CHECK (jsonb_typeof(evidence_refs) = 'array'),
  assessment jsonb NOT NULL CHECK (
    jsonb_typeof(assessment) = 'object'
    AND assessment ->> 'status' IN ('reported', 'under_review', 'assessed')
  ),
  revision bigint NOT NULL CHECK (revision > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, inventory_id, id),
  CONSTRAINT pgr_risk_items_inventory_fk
    FOREIGN KEY (tenant_id, inventory_id)
    REFERENCES sst.pgr_risk_inventories (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX pgr_risk_items_tenant_active_idx
  ON sst.pgr_risk_items (tenant_id, inventory_id, active, id);

CREATE TABLE sst.pgr_risk_inventory_revisions (
  tenant_id text NOT NULL,
  inventory_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL CHECK (
    jsonb_typeof(content) = 'object'
    AND content ->> 'schemaVersion' = '1'
    AND jsonb_typeof(content -> 'title') = 'string'
    AND jsonb_typeof(content -> 'activityDescription') = 'string'
    AND jsonb_typeof(content -> 'actionPlan') = 'string'
    AND jsonb_typeof(content -> 'items') = 'array'
  ),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  actor_role text NOT NULL CHECK (length(actor_role) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, inventory_id, revision),
  CONSTRAINT pgr_inventory_revision_parent_fk
    FOREIGN KEY (tenant_id, inventory_id)
    REFERENCES sst.pgr_risk_inventories (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE sst.pgr_audit_history (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  actor_role text NOT NULL CHECK (length(actor_role) BETWEEN 1 AND 80),
  action text NOT NULL CHECK (action IN ('pgr.created', 'pgr.updated', 'pgr.submitted', 'pgr.approved')),
  target_id text,
  occurred_at timestamptz NOT NULL,
  CHECK (target_id IS NULL OR length(target_id) BETWEEN 1 AND 200)
);

CREATE INDEX pgr_audit_history_tenant_occurred_idx
  ON sst.pgr_audit_history (tenant_id, occurred_at, id);

CREATE FUNCTION sst.reject_pgr_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'PGR history is append-only' USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER pgr_inventory_revisions_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.pgr_risk_inventory_revisions
  FOR EACH ROW EXECUTE FUNCTION sst.reject_pgr_history_mutation();

CREATE TRIGGER pgr_audit_history_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.pgr_audit_history
  FOR EACH ROW EXECUTE FUNCTION sst.reject_pgr_history_mutation();

ALTER TABLE sst.pgr_risk_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.pgr_risk_inventories FORCE ROW LEVEL SECURITY;
CREATE POLICY pgr_risk_inventories_current_tenant ON sst.pgr_risk_inventories
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.pgr_risk_inventory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.pgr_risk_inventory_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY pgr_risk_inventory_revisions_current_tenant ON sst.pgr_risk_inventory_revisions
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.pgr_risk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.pgr_risk_items FORCE ROW LEVEL SECURITY;
CREATE POLICY pgr_risk_items_current_tenant ON sst.pgr_risk_items
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.pgr_audit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.pgr_audit_history FORCE ROW LEVEL SECURITY;
CREATE POLICY pgr_audit_history_current_tenant ON sst.pgr_audit_history
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT SELECT, INSERT ON sst.pgr_risk_inventories TO sst_hoje_app;
GRANT UPDATE (title, activity_description, action_plan, status, reviewer_user_id, reviewer_role, revision, updated_at)
  ON sst.pgr_risk_inventories TO sst_hoje_app;
GRANT SELECT, INSERT ON sst.pgr_risk_items TO sst_hoje_app;
GRANT UPDATE (process, activity, hazard, source_circumstance, possible_harm,
  exposed_groups, exposure_description, existing_measures, evidence_refs,
  assessment, revision, active, updated_at) ON sst.pgr_risk_items TO sst_hoje_app;
GRANT SELECT, INSERT ON sst.pgr_risk_inventory_revisions, sst.pgr_audit_history TO sst_hoje_app;
