-- Tenant-scoped PCMSO records and reviewed references to approved PGR risks.
ALTER TABLE sst.pgr_risk_inventories
  ADD CONSTRAINT pgr_inventory_tenant_scope_unique UNIQUE (tenant_id, id, company_id, unit_id);

CREATE TABLE sst.pcmso_records (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  company_name text NOT NULL CHECK (length(company_name) BETWEEN 1 AND 200),
  unit_name text NOT NULL CHECK (length(unit_name) BETWEEN 1 AND 200),
  coordinator_id text NOT NULL CHECK (length(coordinator_id) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('draft', 'in_review', 'reviewed')),
  version integer NOT NULL CHECK (version >= 0),
  content text NOT NULL CHECK (length(content) <= 12000),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT pcmso_one_record_per_unit UNIQUE (tenant_id, company_id, unit_id),
  CONSTRAINT pcmso_tenant_company_fk FOREIGN KEY (tenant_id, company_id)
    REFERENCES sst.client_companies (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pcmso_tenant_unit_company_fk FOREIGN KEY (tenant_id, unit_id, company_id)
    REFERENCES sst.client_units (tenant_id, id, company_id) ON DELETE RESTRICT,
  CONSTRAINT pcmso_tenant_scope_unique UNIQUE (tenant_id, id, company_id, unit_id)
);
CREATE INDEX pcmso_records_tenant_coordinator_idx
  ON sst.pcmso_records (tenant_id, coordinator_id, updated_at DESC);

CREATE TABLE sst.pcmso_revisions (
  tenant_id text NOT NULL,
  pcmso_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 12000),
  saved_at timestamptz NOT NULL,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  PRIMARY KEY (tenant_id, pcmso_id, version),
  FOREIGN KEY (tenant_id, pcmso_id) REFERENCES sst.pcmso_records (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE sst.pcmso_history (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  tenant_id text NOT NULL,
  pcmso_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('assigned', 'save', 'submit', 'review')),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_id, pcmso_id) REFERENCES sst.pcmso_records (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX pcmso_history_tenant_record_idx
  ON sst.pcmso_history (tenant_id, pcmso_id, occurred_at, id);

CREATE TABLE sst.pcmso_pgr_link_sets (
  tenant_id text NOT NULL,
  pcmso_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  inventory_id text NOT NULL,
  inventory_revision bigint NOT NULL CHECK (inventory_revision > 0),
  version integer NOT NULL CHECK (version > 0),
  medical_review_status text NOT NULL CHECK (medical_review_status IN ('pending', 'reviewed')),
  reviewer_user_id text,
  reviewed_at timestamptz,
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, pcmso_id),
  CHECK ((medical_review_status = 'pending' AND reviewer_user_id IS NULL AND reviewed_at IS NULL)
      OR (medical_review_status = 'reviewed' AND reviewer_user_id IS NOT NULL AND length(reviewer_user_id) BETWEEN 1 AND 200 AND reviewed_at IS NOT NULL)),
  FOREIGN KEY (tenant_id, pcmso_id, company_id, unit_id)
    REFERENCES sst.pcmso_records (tenant_id, id, company_id, unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, inventory_id, company_id, unit_id)
    REFERENCES sst.pgr_risk_inventories (tenant_id, id, company_id, unit_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, inventory_id, inventory_revision)
    REFERENCES sst.pgr_risk_inventory_revisions (tenant_id, inventory_id, revision) ON DELETE RESTRICT,
  UNIQUE (tenant_id, pcmso_id, inventory_id)
);

CREATE TABLE sst.pcmso_pgr_risk_links (
  tenant_id text NOT NULL,
  pcmso_id text NOT NULL,
  inventory_id text NOT NULL,
  risk_item_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tenant_id, pcmso_id, risk_item_id),
  UNIQUE (tenant_id, pcmso_id, position),
  FOREIGN KEY (tenant_id, pcmso_id, inventory_id) REFERENCES sst.pcmso_pgr_link_sets (tenant_id, pcmso_id, inventory_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, inventory_id, risk_item_id)
    REFERENCES sst.pgr_risk_items (tenant_id, inventory_id, id) ON DELETE RESTRICT
);

CREATE TABLE sst.pcmso_pgr_link_history (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  tenant_id text NOT NULL,
  pcmso_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('saved', 'reviewed')),
  version integer NOT NULL CHECK (version > 0),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  FOREIGN KEY (tenant_id, pcmso_id) REFERENCES sst.pcmso_records (tenant_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION sst.reject_pcmso_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'PCMSO history is append-only' USING ERRCODE = '55000';
END
$function$;
CREATE TRIGGER pcmso_revisions_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.pcmso_revisions
  FOR EACH ROW EXECUTE FUNCTION sst.reject_pcmso_history_mutation();
CREATE TRIGGER pcmso_history_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.pcmso_history
  FOR EACH ROW EXECUTE FUNCTION sst.reject_pcmso_history_mutation();
CREATE TRIGGER pcmso_pgr_link_history_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.pcmso_pgr_link_history
  FOR EACH ROW EXECUTE FUNCTION sst.reject_pcmso_history_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pcmso_records', 'pcmso_revisions', 'pcmso_history', 'pcmso_pgr_link_sets', 'pcmso_pgr_risk_links', 'pcmso_pgr_link_history'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name || '_current_tenant', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON sst.pcmso_records TO sst_hoje_app;
GRANT SELECT, INSERT ON sst.pcmso_revisions, sst.pcmso_history, sst.pcmso_pgr_link_history TO sst_hoje_app;
GRANT SELECT, INSERT, UPDATE ON sst.pcmso_pgr_link_sets TO sst_hoje_app;
GRANT SELECT, INSERT, DELETE ON sst.pcmso_pgr_risk_links TO sst_hoje_app;
