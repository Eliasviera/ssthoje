-- Normalized, tenant-scoped projection of exposure evaluations linked to PGR risk items.
-- Immutable inventory revision snapshots remain the audit/history source of truth.

CREATE TABLE sst.pgr_exposure_evaluations (
  tenant_id text NOT NULL,
  inventory_id text NOT NULL,
  risk_item_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 64),
  agent text NOT NULL CHECK (length(agent) BETWEEN 1 AND 300),
  evaluation_type text NOT NULL CHECK (evaluation_type IN ('qualitative', 'quantitative')),
  status text NOT NULL CHECK (status IN ('planned', 'collected', 'reviewed')),
  method text CHECK (method IS NULL OR length(method) <= 200),
  result text CHECK (result IS NULL OR length(result) <= 1000),
  unit text CHECK (unit IS NULL OR length(unit) <= 200),
  evaluated_at timestamptz,
  responsible text CHECK (responsible IS NULL OR length(responsible) <= 200),
  qualification text CHECK (qualification IS NULL OR length(qualification) <= 300),
  professional_registration text CHECK (professional_registration IS NULL OR length(professional_registration) <= 200),
  art_reference text CHECK (art_reference IS NULL OR length(art_reference) <= 200),
  evidence_refs jsonb NOT NULL CHECK (jsonb_typeof(evidence_refs) = 'array'),
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, inventory_id, risk_item_id, id),
  CONSTRAINT pgr_exposure_evaluations_risk_fk
    FOREIGN KEY (tenant_id, inventory_id, risk_item_id)
    REFERENCES sst.pgr_risk_items (tenant_id, inventory_id, id) ON DELETE RESTRICT,
  CHECK (status = 'planned' OR (method IS NOT NULL AND length(trim(method)) > 0
    AND result IS NOT NULL AND length(trim(result)) > 0
    AND responsible IS NOT NULL AND length(trim(responsible)) > 0 AND evaluated_at IS NOT NULL)),
  CHECK (evaluation_type <> 'quantitative' OR status = 'planned' OR (unit IS NOT NULL AND length(trim(unit)) > 0))
);

CREATE INDEX pgr_exposure_evaluations_risk_idx
  ON sst.pgr_exposure_evaluations (tenant_id, inventory_id, risk_item_id, revision);

ALTER TABLE sst.pgr_exposure_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.pgr_exposure_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY pgr_exposure_evaluations_current_tenant ON sst.pgr_exposure_evaluations
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT SELECT, INSERT, DELETE ON sst.pgr_exposure_evaluations TO sst_hoje_app;
GRANT UPDATE (agent, evaluation_type, status, method, result, unit, evaluated_at,
  responsible, qualification, professional_registration, art_reference, evidence_refs,
  revision, updated_at) ON sst.pgr_exposure_evaluations TO sst_hoje_app;
