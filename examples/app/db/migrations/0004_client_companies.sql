-- Tenant-scoped company/unit schema. No application records are imported here.

CREATE TABLE sst.client_companies (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 1 AND 160),
  trade_name text NOT NULL CHECK (length(trade_name) <= 120),
  contact_name text NOT NULL CHECK (length(contact_name) <= 120),
  contact_email text NOT NULL CHECK (length(contact_email) <= 254),
  contact_phone text NOT NULL CHECK (length(contact_phone) <= 30),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX client_companies_tenant_status_created_idx
  ON sst.client_companies (tenant_id, status, created_at DESC);

CREATE TABLE sst.client_units (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  cnpj text NOT NULL CHECK (length(cnpj) BETWEEN 1 AND 32),
  cnpj_normalized text GENERATED ALWAYS AS (regexp_replace(cnpj, '[^0-9]', '', 'g')) STORED,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  city_state text NOT NULL CHECK (length(city_state) <= 120),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT client_units_company_tenant_fk
    FOREIGN KEY (tenant_id, company_id)
    REFERENCES sst.client_companies (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT client_units_cnpj_length_check
    CHECK (length(cnpj_normalized) = 14)
);

-- Deliberately non-unique: importing must preserve the known active/archived
-- duplicate. New-write serialization and conflict policy belong in the store.
CREATE INDEX client_units_tenant_cnpj_idx
  ON sst.client_units (tenant_id, cnpj_normalized);

CREATE INDEX client_units_tenant_company_idx
  ON sst.client_units (tenant_id, company_id);

CREATE TABLE sst.client_audit_history (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  actor_role text NOT NULL CHECK (length(actor_role) BETWEEN 1 AND 80),
  action text NOT NULL CHECK (action IN ('client.created', 'client.updated', 'client.status_changed')),
  target_id text,
  occurred_at timestamptz NOT NULL,
  CHECK (target_id IS NULL OR length(target_id) BETWEEN 1 AND 200)
);

CREATE INDEX client_audit_history_tenant_occurred_idx
  ON sst.client_audit_history (tenant_id, occurred_at, id);

CREATE FUNCTION sst.reject_client_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'client audit history is append-only' USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER client_audit_history_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.client_audit_history
  FOR EACH ROW EXECUTE FUNCTION sst.reject_client_audit_mutation();

ALTER TABLE sst.client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.client_companies FORCE ROW LEVEL SECURITY;
CREATE POLICY client_companies_current_tenant ON sst.client_companies
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.client_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.client_units FORCE ROW LEVEL SECURITY;
CREATE POLICY client_units_current_tenant ON sst.client_units
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.client_audit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.client_audit_history FORCE ROW LEVEL SECURITY;
CREATE POLICY client_audit_history_current_tenant ON sst.client_audit_history
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON sst.client_companies TO sst_hoje_app;
GRANT SELECT, INSERT ON sst.client_units, sst.client_audit_history TO sst_hoje_app;
