DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sst_hoje_app') THEN
    CREATE ROLE sst_hoje_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$migration$;

CREATE TABLE sst.tenants (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sst.tenant_memberships (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 200),
  role text NOT NULL CHECK (role IN (
    'consultoria_admin', 'sst_tst', 'cliente', 'terceiro',
    'profissional_habilitado', 'medico_coordenador'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX tenant_memberships_user_status_idx
  ON sst.tenant_memberships (user_id, status);

CREATE FUNCTION sst.bump_row_version() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END
$function$;

CREATE TRIGGER tenants_bump_row_version
  BEFORE UPDATE ON sst.tenants
  FOR EACH ROW EXECUTE FUNCTION sst.bump_row_version();

CREATE TRIGGER memberships_bump_row_version
  BEFORE UPDATE ON sst.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION sst.bump_row_version();

ALTER TABLE sst.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_current_scope ON sst.tenants
  USING (id = current_setting('sst.tenant_id', true))
  WITH CHECK (id = current_setting('sst.tenant_id', true));

ALTER TABLE sst.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_current_user ON sst.tenant_memberships
  USING (user_id = current_setting('sst.user_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT CONNECT ON DATABASE sst_hoje_dev TO sst_hoje_app;
GRANT USAGE ON SCHEMA sst TO sst_hoje_app;
GRANT SELECT ON sst.tenants, sst.tenant_memberships TO sst_hoje_app;
