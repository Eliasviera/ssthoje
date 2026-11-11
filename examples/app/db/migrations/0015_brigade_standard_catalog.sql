-- Fase 2 do PAE/Brigada: catálogo de ITs estaduais do Corpo de Bombeiros.
-- A IT determina a COMPOSIÇÃO (quantos brigadistas) e a FORMAÇÃO (níveis de treinamento).
-- Nenhum cálculo é executado aqui: este schema só guarda a norma de forma versionada e auditável.
-- A publicação exige conferência e assinatura humana (reviewer).
--
-- brigade_standards e brigade_occupancy_bands são catálogo de referência (global por UF).
-- brigade_standard_reviews e brigade_occupancy_band_entries são o conteúdo versionado por tenant
-- que originou a publicação; ficam auditáveis e não podem ser apagados.

CREATE TABLE sst.brigade_standards (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  jurisdiction text NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  it_number text NOT NULL CHECK (length(it_number) BETWEEN 1 AND 40),
  it_version text NOT NULL CHECK (length(it_version) BETWEEN 1 AND 40),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  issued_at date,
  valid_from date NOT NULL,
  valid_until date,
  source_url text NOT NULL DEFAULT '' CHECK (length(source_url) <= 500),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  reviewer text,
  reviewed_at timestamptz,
  published_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CHECK ((status = 'active') = (reviewer IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK ((status = 'active') = (published_by IS NOT NULL AND published_at IS NOT NULL))
);

-- Uma única versão vigente por IT de cada estado.
CREATE UNIQUE INDEX brigade_standards_one_active_idx
  ON sst.brigade_standards (jurisdiction, it_number) WHERE status = 'active';

CREATE INDEX brigade_standards_jurisdiction_idx
  ON sst.brigade_standards (jurisdiction, status);

-- Faixas de população por ocupação e grau de risco, com a composição e a formação exigidas pela IT.
-- As colunas de formação são livres (o rótulo vem da própria IT), porque cada estado usa níveis próprios.
CREATE TABLE sst.brigade_occupancy_bands (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  standard_id text NOT NULL REFERENCES sst.brigade_standards(id) ON DELETE RESTRICT,
  occupancy_code text NOT NULL CHECK (length(occupancy_code) BETWEEN 1 AND 40),
  occupancy_label text NOT NULL CHECK (length(occupancy_label) BETWEEN 1 AND 160),
  risk_level text NOT NULL CHECK (length(risk_level) BETWEEN 1 AND 60),
  population_from integer NOT NULL CHECK (population_from >= 0),
  population_to integer CHECK (population_to IS NULL OR population_to >= population_from),
  brigadists_min integer NOT NULL CHECK (brigadists_min >= 0),
  -- Formação exigida: lista de níveis com a quantidade, no vocabulário da própria IT.
  formation jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (standard_id, occupancy_code, risk_level, population_from),
  CHECK (jsonb_typeof(formation) = 'array')
);

CREATE INDEX brigade_occupancy_bands_lookup_idx
  ON sst.brigade_occupancy_bands (standard_id, occupancy_code, risk_level, population_from);

-- Registro da conferência humana que originou cada publicação do catálogo.
CREATE TABLE sst.brigade_standard_reviews (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  standard_id text NOT NULL REFERENCES sst.brigade_standards(id) ON DELETE RESTRICT,
  reviewer text NOT NULL CHECK (length(reviewer) BETWEEN 1 AND 160),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  method text NOT NULL CHECK (method IN ('manual_transcription', 'assisted_extraction')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  reviewed_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX brigade_standard_reviews_standard_idx
  ON sst.brigade_standard_reviews (standard_id, reviewed_at);

-- Retrato das faixas no momento da publicação (o que foi conferido, linha a linha).
CREATE TABLE sst.brigade_occupancy_band_entries (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  review_id text NOT NULL,
  band_id text NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id, review_id, band_id),
  FOREIGN KEY (tenant_id, review_id) REFERENCES sst.brigade_standard_reviews(tenant_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(snapshot) = 'object')
);

-- Histórico append-only: nada do que foi conferido pode ser alterado ou apagado.
CREATE FUNCTION sst.reject_brigade_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico do catálogo de brigada é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER brigade_reviews_immutable BEFORE UPDATE OR DELETE ON sst.brigade_standard_reviews
  FOR EACH ROW EXECUTE FUNCTION sst.reject_brigade_history_mutation();
CREATE TRIGGER brigade_band_entries_immutable BEFORE UPDATE OR DELETE ON sst.brigade_occupancy_band_entries
  FOR EACH ROW EXECUTE FUNCTION sst.reject_brigade_history_mutation();

-- O catálogo em si não pode ser apagado: só passa a 'superseded'.
CREATE FUNCTION sst.reject_brigade_standard_delete() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Catálogo de brigada não pode ser apagado; use status = superseded'
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER brigade_standards_no_delete BEFORE DELETE ON sst.brigade_standards
  FOR EACH ROW EXECUTE FUNCTION sst.reject_brigade_standard_delete();

-- RLS nas tabelas tenant-scoped; o catálogo de referência é global mas restrito à role do app.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'brigade_standard_reviews', 'brigade_occupancy_band_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['brigade_standards', 'brigade_occupancy_bands'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

-- A role do app pode inserir o catálogo em rascunho e promover o status, mas não apagar.
GRANT INSERT ON sst.brigade_standards, sst.brigade_occupancy_bands TO sst_hoje_app;
GRANT UPDATE (status, reviewer, reviewed_at, published_by, published_at)
  ON sst.brigade_standards TO sst_hoje_app;
