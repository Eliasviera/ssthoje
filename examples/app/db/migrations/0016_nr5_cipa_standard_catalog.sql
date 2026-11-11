-- NR-5 (CIPA) — catálogo de referência normativa.
-- Fonte oficial: NR-05 atualizada 2022 (Portaria MTP nº 4.219, de 20/12/2022),
--   https://www.gov.br/trabalho-e-emprego/.../arquivos/normas-regulamentadoras/nr-05-atualizada-2022.pdf
--   SHA-256 do arquivo baixado: c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55
--
-- Este schema guarda a norma de forma versionada e auditável. Nenhum cálculo é executado aqui.
-- Quadro I (dimensionamento) e as regras de treinamento são dados, não constantes de código.
--
-- Catálogo global (sem tenant): nr5_standards, nr5_dimension_bands, nr5_training_requirements,
--   nr5_election_rules.
-- Conteúdo por tenant, append-only: nr5_standard_reviews, nr5_dimension_band_entries.

CREATE TABLE sst.nr5_standards (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  edition text NOT NULL CHECK (length(edition) BETWEEN 1 AND 80),
  issuing_act text NOT NULL CHECK (length(issuing_act) BETWEEN 1 AND 200),
  issued_at date,
  valid_from date NOT NULL,
  valid_until date,
  source_url text NOT NULL CHECK (length(source_url) <= 600),
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

-- Uma única edição vigente da NR-5.
CREATE UNIQUE INDEX nr5_standards_one_active_idx
  ON sst.nr5_standards ((status)) WHERE status = 'active';

-- Quadro I — Dimensionamento da CIPA (subitem 5.4.1).
-- Faixa por número de empregados no estabelecimento e grau de risco (NR-4, CNAE 2.0).
CREATE TABLE sst.nr5_dimension_bands (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  risk_grade smallint NOT NULL CHECK (risk_grade BETWEEN 1 AND 4),
  employees_from integer NOT NULL CHECK (employees_from >= 0),
  employees_to integer CHECK (employees_to IS NULL OR employees_to >= employees_from),
  effective_members smallint NOT NULL CHECK (effective_members >= 0),
  substitute_members smallint NOT NULL CHECK (substitute_members >= 0),
  -- Incremento por grupo de 2.500 empregados acima do último intervalo do Quadro I.
  increment_per_group smallint NOT NULL DEFAULT 0 CHECK (increment_per_group >= 0),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 600),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (standard_id, risk_grade, employees_from)
);

CREATE INDEX nr5_dimension_bands_lookup_idx
  ON sst.nr5_dimension_bands (standard_id, risk_grade, employees_from);

-- Treinamento (subitem 5.7).
CREATE TABLE sst.nr5_training_requirements (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  audience text NOT NULL CHECK (audience IN ('cipa_member', 'named_representative')),
  risk_grade smallint CHECK (risk_grade IS NULL OR risk_grade BETWEEN 1 AND 4),
  min_hours numeric(4,1) NOT NULL CHECK (min_hours > 0),
  max_hours_per_day numeric(4,1) NOT NULL DEFAULT 8 CHECK (max_hours_per_day > 0),
  distance_learning_allowed boolean NOT NULL DEFAULT false,
  deadline_days_after_possession integer CHECK (deadline_days_after_possession IS NULL OR deadline_days_after_possession > 0),
  reuse_within_months integer CHECK (reuse_within_months IS NULL OR reuse_within_months > 0),
  source_item text NOT NULL CHECK (length(source_item) BETWEEN 1 AND 40),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 600),
  UNIQUE (standard_id, audience, risk_grade)
);

-- Processo eleitoral (subitem 5.5) — prazos e regras de validade da votação.
CREATE TABLE sst.nr5_election_rules (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_.]{1,60}$'),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 600),
  min_days integer CHECK (min_days IS NULL OR min_days >= 0),
  source_item text NOT NULL CHECK (length(source_item) BETWEEN 1 AND 40),
  UNIQUE (standard_id, code)
);

-- Conferência humana que autorizou a publicação (por tenant, append-only).
CREATE TABLE sst.nr5_standard_reviews (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  reviewer text NOT NULL CHECK (length(reviewer) BETWEEN 1 AND 160),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  method text NOT NULL CHECK (method IN ('manual_transcription', 'assisted_extraction')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  reviewed_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX nr5_standard_reviews_standard_idx
  ON sst.nr5_standard_reviews (standard_id, reviewed_at);

-- Retrato das faixas conferidas no momento da publicação.
CREATE TABLE sst.nr5_dimension_band_entries (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  review_id text NOT NULL,
  band_id text NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (tenant_id, review_id, band_id),
  FOREIGN KEY (tenant_id, review_id) REFERENCES sst.nr5_standard_reviews(tenant_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE FUNCTION sst.reject_nr5_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico do catálogo NR-5 é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER nr5_reviews_immutable BEFORE UPDATE OR DELETE ON sst.nr5_standard_reviews
  FOR EACH ROW EXECUTE FUNCTION sst.reject_nr5_history_mutation();
CREATE TRIGGER nr5_band_entries_immutable BEFORE UPDATE OR DELETE ON sst.nr5_dimension_band_entries
  FOR EACH ROW EXECUTE FUNCTION sst.reject_nr5_history_mutation();

CREATE FUNCTION sst.reject_nr5_standard_delete() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Catálogo NR-5 não pode ser apagado; use status = superseded'
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER nr5_standards_no_delete BEFORE DELETE ON sst.nr5_standards
  FOR EACH ROW EXECUTE FUNCTION sst.reject_nr5_standard_delete();

-- RLS nas tabelas por tenant; catálogo global restrito à role do app.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['nr5_standard_reviews', 'nr5_dimension_band_entries'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['nr5_standards', 'nr5_dimension_bands', 'nr5_training_requirements', 'nr5_election_rules'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

GRANT INSERT ON sst.nr5_standards, sst.nr5_dimension_bands, sst.nr5_training_requirements, sst.nr5_election_rules TO sst_hoje_app;
GRANT UPDATE (status, reviewer, reviewed_at, published_by, published_at) ON sst.nr5_standards TO sst_hoje_app;
