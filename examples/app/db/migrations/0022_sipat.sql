-- NR-5 (CIPA) — SIPAT: Semana Interna de Prevenção de Acidentes do Trabalho.
--
-- Base normativa: NR-05 atualizada 2022 (Portaria MTP nº 4.219/2022).
--   5.3.1.i  A CIPA promove, anualmente, em conjunto com o SESMT, onde houver,
--            a Semana Interna de Prevenção de Acidentes do Trabalho — SIPAT,
--            conforme programação definida pela CIPA.
--   5.4.13.1 Quando não houver CIPA e houver SESMT, este desempenha as atribuições da CIPA
--            (incluindo a SIPAT quando aplicável).
--
-- Uma SIPAT por ano por CIPA (índice único term_id + year). A programação é
-- definida pela CIPA e registrada com referência ao mandato que a aprovou.

-- A semana da SIPAT, ligada ao mandato da CIPA que a programa.
CREATE TABLE sst.sipat_weeks (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  term_id text NOT NULL,
  year smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  -- Tema central da SIPAT.
  theme text NOT NULL CHECK (length(theme) BETWEEN 1 AND 200),
  scheduled_from date NOT NULL,
  scheduled_to date NOT NULL,
  -- 5.3.1.i: em conjunto com o SESMT, quando houver.
  sesmt_partner boolean NOT NULL DEFAULT false,
  sesmt_partner_name text NOT NULL DEFAULT '' CHECK (length(sesmt_partner_name) <= 200),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'confirmed', 'held', 'cancelled')),
  -- Referência da ata da CIPA que aprovou a programação (5.3.1.i).
  approved_minute_id text CHECK (approved_minute_id IS NULL OR length(approved_minute_id) <= 200),
  -- Relatório final, quando houver.
  report_document_id text CHECK (report_document_id IS NULL OR length(report_document_id) <= 200),
  held_on date,
  attendance integer CHECK (attendance IS NULL OR attendance >= 0),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES sst.cipa_terms(tenant_id, id) ON DELETE RESTRICT,
  CHECK (scheduled_to >= scheduled_from),
  CHECK (status <> 'held' OR held_on IS NOT NULL),
  CHECK (status <> 'cancelled' OR notes <> ''),
  CHECK (sesmt_partner = (sesmt_partner_name <> ''))
);

-- Uma SIPAT por ano, por CIPA.
CREATE UNIQUE INDEX sipat_weeks_one_per_year_idx
  ON sst.sipat_weeks (tenant_id, term_id, year);

CREATE INDEX sipat_weeks_term_idx ON sst.sipat_weeks (tenant_id, term_id, year);

-- Programação interna da semana: palestras, treinamentos, dinâmicas, dia a dia.
CREATE TABLE sst.sipat_activities (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  week_id text NOT NULL,
  starts_on date NOT NULL,
  starts_at time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  activity_type text NOT NULL CHECK (activity_type IN ('palestra', 'treinamento', 'dinamica', 'simulado', 'sipat', 'outra')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  speaker text NOT NULL DEFAULT '' CHECK (length(speaker) <= 200),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 200),
  target_audience text NOT NULL DEFAULT '' CHECK (length(target_audience) <= 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, week_id) REFERENCES sst.sipat_weeks(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX sipat_activities_week_idx ON sst.sipat_activities (tenant_id, week_id, starts_on, starts_at);

-- Auditoria imutável da SIPAT.
CREATE TABLE sst.sipat_events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  week_id text NOT NULL,
  action text NOT NULL CHECK (action IN (
    'sipat.planned', 'sipat.confirmed', 'sipat.held', 'sipat.cancelled', 'sipat.reported'
  )),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, week_id) REFERENCES sst.sipat_weeks(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX sipat_events_week_idx ON sst.sipat_events (tenant_id, week_id, occurred_at);

-- Histórico imutável.
CREATE FUNCTION sst.reject_sipat_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico da SIPAT é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER sipat_events_immutable BEFORE UPDATE OR DELETE ON sst.sipat_events
  FOR EACH ROW EXECUTE FUNCTION sst.reject_sipat_history_mutation();

-- Semana realizada ou cancelada não volta a planejada.
CREATE FUNCTION sst.reject_sipat_reopen() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status IN ('held', 'cancelled') AND NEW.status IN ('planned', 'confirmed') THEN
    RAISE EXCEPTION 'SIPAT realizada ou cancelada não pode voltar a planejada'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER sipat_weeks_no_reopen BEFORE UPDATE ON sst.sipat_weeks
  FOR EACH ROW EXECUTE FUNCTION sst.reject_sipat_reopen();

-- RLS nas tabelas por tenant.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sipat_weeks', 'sipat_activities', 'sipat_events'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

-- Operação corrente das semanas e atividades.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sipat_weeks', 'sipat_activities'] LOOP
    EXECUTE format('GRANT UPDATE ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;
