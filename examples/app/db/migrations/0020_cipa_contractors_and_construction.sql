-- NR-5 (CIPA) — Fase 6: organizações contratadas para prestação de serviços e Anexo I (construção).
--
-- Base normativa: NR-05 atualizada 2022 (Portaria MTP nº 4.219/2022).
--
-- Parte geral (5.8):
--   prestadora com total de empregados na UF no Quadro I → CIPA centralizada ..... 5.8.1
--   contratante em GR 3 ou 4 e prestadora no Quadro I → CIPA própria no local .... 5.8.1.1
--   serviço de até 180 dias → dispensa de CIPA própria ........................... 5.8.1.1.1
--   dimensionamento da centralizada desconta empregados cobertos por CIPA própria . 5.8.1.2
--   desobrigada de CIPA própria com 5+ empregados → nomear representante NR-05 .... 5.8.2
--   nomeação dispensada onde há membro de CIPA centralizada ....................... 5.8.2.1
--   representante nomeado treinado conforme grau de risco da CONTRATANTE ......... 5.8.4
--   CIPA da contratada encerra quando encerram as atividades no local ............. 5.8.5
--   contratante deve exigir a nomeação da contratada .............................. 5.8.6
--   contratante deve convidar a contratada para a reunião da CIPA ................. 5.8.7
--
-- Anexo I (indústria da construção):
--   CIPA por canteiro de obras no Quadro I ........................................ 3.1
--   canteiro fora do Quadro I → nomear ao menos 1 representante ................... 3.1.1
--   dispensa de CIPA por frente de trabalho ...................................... 3.1.2
--   havendo frente de trabalho → nomear representante por frente ................. 3.1.3
--   um representante pode cobrir mais de uma frente .............................. 3.1.3.1
--   prestadora no canteiro com 5+ empregados → nomear representante .............. 3.2
--   executante nos canteiros no Quadro I → CIPA centralizada na UF ................ 3.2.3
--   obras de até 180 dias: dispensa de CIPA, mas nomeia representante ........... 3.3 / 3.3.1
--   representante nomeado: treinamento mínimo de 8 horas ......................... 3.5.1
--   convalidação de treinamento entre organizações (NR-01 item 1.7) .............. 3.5.1.2
--   CIPA do canteiro encerra quando a obra finaliza .............................. 3.7

-- Situação de CIPA de uma contratada em relação a um estabelecimento da contratante.
CREATE TABLE sst.cipa_contractor_scopes (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  -- Estabelecimento da CONTRATANTE onde o serviço é prestado.
  company_id text NOT NULL,
  unit_id text NOT NULL,
  -- Identificação da contratada (CNPJ normalizado é o vínculo disponível no sistema hoje).
  contractor_cnpj text NOT NULL CHECK (contractor_cnpj ~ '^[0-9]{14}$'),
  contractor_name text NOT NULL CHECK (length(contractor_name) BETWEEN 1 AND 200),
  -- Terceiro/caso do módulo de terceiros, quando já existir vínculo confirmado.
  third_party_id text,
  -- Grau de risco da contratante (define o treinamento do representante — 5.8.4).
  client_risk_grade smallint NOT NULL CHECK (client_risk_grade BETWEEN 1 AND 4),
  -- Empregados próprios da contratada neste estabelecimento.
  employees_on_site integer NOT NULL CHECK (employees_on_site >= 0),
  -- Decisão de constituição tomada pelo responsável técnico.
  arrangement text NOT NULL CHECK (arrangement IN (
    'own_cipa_on_site',        -- 5.8.1.1
    'centralized_cipa',        -- 5.8.1
    'named_representative',    -- 5.8.2
    'exempt_short_service'     -- 5.8.1.1.1 (até 180 dias)
  )),
  -- Justificativa registrada da decisão (fonte e fundamento).
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000),
  -- Referência à CIPA centralizada, quando houver.
  centralized_term_id text,
  -- Serviço com prazo (relevante para a dispensa de 180 dias).
  service_started_on date NOT NULL,
  service_ends_on date,
  -- Convite da contratante para participar da reunião da CIPA (5.8.7).
  meeting_invitation_at timestamptz,
  meeting_invitation_channel text NOT NULL DEFAULT '' CHECK (length(meeting_invitation_channel) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_on date,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, centralized_term_id) REFERENCES sst.cipa_terms(tenant_id, id),
  -- CIPA centralizada exige a referência ao mandato centralizado.
  CHECK (arrangement <> 'centralized_cipa' OR centralized_term_id IS NOT NULL),
  -- Dispensa por prazo curto exige data de término do serviço.
  CHECK (arrangement <> 'exempt_short_service' OR service_ends_on IS NOT NULL),
  CHECK (service_ends_on IS NULL OR service_ends_on >= service_started_on),
  CHECK ((status = 'ended') = (ended_on IS NOT NULL))
);

-- Um arranjo vigente por contratada em cada estabelecimento da contratante.
CREATE UNIQUE INDEX cipa_contractor_scopes_one_active_idx
  ON sst.cipa_contractor_scopes (tenant_id, company_id, unit_id, contractor_cnpj) WHERE status = 'active';

CREATE INDEX cipa_contractor_scopes_unit_idx
  ON sst.cipa_contractor_scopes (tenant_id, company_id, unit_id, status);

-- Anexo I — indústria da construção: canteiros de obras e frentes de trabalho.
CREATE TABLE sst.cipa_construction_sites (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  site_code text NOT NULL CHECK (length(site_code) BETWEEN 1 AND 60),
  site_name text NOT NULL CHECK (length(site_name) BETWEEN 1 AND 200),
  -- Duração da obra (relevante para a dispensa de 180 dias — Anexo I 3.3).
  started_on date NOT NULL,
  expected_end_on date,
  completed_on date,
  -- CIPA por canteiro (Anexo I 3.1) — nulo quando a obra não se enquadra no Quadro I.
  term_id text,
  employee_count integer NOT NULL CHECK (employee_count >= 0),
  -- Quantidade de frentes de trabalho (Anexo I 3.1.3).
  work_fronts smallint NOT NULL DEFAULT 0 CHECK (work_fronts >= 0),
  -- Comunicação Prévia de Obra ao sindicato (Anexo I 3.3).
  cpo_registered_on date,
  cpo_sent_to_union_on date,
  -- Conclusão formalizada pelo responsável técnico (Anexo I 3.7.2).
  completion_report_document_id text,
  completion_sent_to_union_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, term_id) REFERENCES sst.cipa_terms(tenant_id, id),
  UNIQUE (tenant_id, company_id, site_code),
  CHECK (expected_end_on IS NULL OR expected_end_on >= started_on),
  CHECK (status <> 'completed' OR completed_on IS NOT NULL)
);

CREATE INDEX cipa_construction_sites_unit_idx
  ON sst.cipa_construction_sites (tenant_id, company_id, unit_id, status);

-- Representante nomeado da NR-05 por canteiro ou frente de trabalho (Anexo I 3.1.1 / 3.1.3).
CREATE TABLE sst.cipa_site_representatives (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  site_id text NOT NULL,
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 1 AND 200),
  -- 'responsible_organization' = organização responsável pela obra;
  -- 'contractor' = prestadora de serviços no canteiro/frente (Anexo I 3.2).
  appointing_party text NOT NULL CHECK (appointing_party IN ('responsible_organization', 'contractor')),
  -- Frente de trabalho coberta (nulo = canteiro inteiro; Anexo I 3.1.3.1 permite mais de uma).
  work_front text NOT NULL DEFAULT '' CHECK (length(work_front) <= 120),
  -- Nomeação formalizada anualmente (5.4.14).
  appointed_on date NOT NULL,
  valid_until date NOT NULL,
  -- Treinamento mínimo de 8h (Anexo I 3.5.1); convalidação permitida (3.5.1.2).
  training_completed_on date,
  training_valid_until date,
  training_organization text NOT NULL DEFAULT '' CHECK (length(training_organization) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_on date,
  end_reason text NOT NULL DEFAULT '' CHECK (length(end_reason) <= 600),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sst.cipa_construction_sites(tenant_id, id) ON DELETE RESTRICT,
  CHECK (valid_until > appointed_on),
  CHECK ((status = 'ended') = (ended_on IS NOT NULL)),
  CHECK (training_valid_until IS NULL OR training_completed_on IS NOT NULL)
);

-- Um representante ativo por canteiro/frente e parte nomeante.
CREATE UNIQUE INDEX cipa_site_reps_one_active_idx
  ON sst.cipa_site_representatives (tenant_id, site_id, appointing_party, work_front) WHERE status = 'active';

CREATE INDEX cipa_site_reps_site_idx ON sst.cipa_site_representatives (tenant_id, site_id, status);

-- Auditoria append-only dos fatos de terceiros e construção.
CREATE TABLE sst.cipa_contractor_events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  target_kind text NOT NULL CHECK (target_kind IN ('contractor_scope', 'construction_site', 'site_representative')),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  action text NOT NULL CHECK (action IN (
    'contractor.arrangement_defined', 'contractor.meeting_invited', 'contractor.ended',
    'site.registered', 'site.cpo_sent', 'site.completed',
    'site_representative.appointed', 'site_representative.renewed', 'site_representative.ended'
  )),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX cipa_contractor_events_idx ON sst.cipa_contractor_events (tenant_id, target_kind, target_id, occurred_at);

-- Histórico imutável.
CREATE FUNCTION sst.reject_cipa_contractor_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico de terceiros/construção da CIPA é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER cipa_contractor_events_immutable BEFORE UPDATE OR DELETE ON sst.cipa_contractor_events
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_contractor_history_mutation();

-- Obra concluída não volta a ativa; arranjo encerrado não reabre.
CREATE FUNCTION sst.reject_cipa_contractor_reopen() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'cipa_construction_sites' AND OLD.status IN ('completed', 'cancelled') AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Obra concluída ou cancelada não pode voltar a ativa' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'cipa_contractor_scopes' AND OLD.status = 'ended' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Arranjo encerrado não pode ser reaberto' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER cipa_sites_no_reopen BEFORE UPDATE ON sst.cipa_construction_sites
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_contractor_reopen();
CREATE TRIGGER cipa_scopes_no_reopen BEFORE UPDATE ON sst.cipa_contractor_scopes
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_contractor_reopen();

-- RLS nas tabelas por tenant.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cipa_contractor_scopes', 'cipa_construction_sites', 'cipa_site_representatives', 'cipa_contractor_events'
  ] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cipa_contractor_scopes', 'cipa_construction_sites', 'cipa_site_representatives'] LOOP
    EXECUTE format('GRANT UPDATE ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;
