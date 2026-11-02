-- Tenant-scoped PT/PTE drafts. Drafts remain non-operational until separate
-- technical review, authorization and release workflows are implemented.
CREATE TABLE sst.work_permit_drafts (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  map_id text NOT NULL CHECK (map_id IN ('pte-confined-space', 'hot-work-composite')),
  apr_id text CHECK (apr_id IS NULL OR length(apr_id) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  field_values jsonb NOT NULL CHECK (jsonb_typeof(field_values) = 'object'),
  status text NOT NULL CHECK (status = 'draft_demo'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  updated_at timestamptz,
  updated_by text CHECK (updated_by IS NULL OR length(updated_by) BETWEEN 1 AND 200),
  PRIMARY KEY (tenant_id, id),
  CHECK ((updated_at IS NULL AND updated_by IS NULL) OR (updated_at IS NOT NULL AND updated_by IS NOT NULL))
);

CREATE INDEX work_permit_drafts_tenant_updated_idx
  ON sst.work_permit_drafts (tenant_id, COALESCE(updated_at, created_at) DESC);

ALTER TABLE sst.work_permit_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.work_permit_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY work_permit_drafts_current_tenant ON sst.work_permit_drafts
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON sst.work_permit_drafts TO sst_hoje_app;
