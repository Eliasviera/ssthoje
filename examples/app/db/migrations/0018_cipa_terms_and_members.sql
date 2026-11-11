-- NR-5 (CIPA) — Fase 3: mandato, composição e representante nomeado.
--
-- Base normativa: NR-05 atualizada 2022 (Portaria MTP nº 4.219/2022).
--   mandato de 1 ano com uma reeleição .......................... 5.4.6
--   posse no primeiro dia útil após o término anterior .......... 5.4.7
--   eleitos: escrutínio secreto; designados: por designação ..... 5.4.3 / 5.4.4
--   presidente designado; vice escolhido entre titulares eleitos . 5.4.5
--   estabilidade: da candidatura até 1 ano após o mandato ....... 5.4.12
--   vedada redução de representantes no mandato ................. 5.4.10
--   representante nomeado quando fora do Quadro I e sem SESMT ... 5.4.13
--   nomeação do representante formalizada anualmente ............ 5.4.14
--   documentação mantida por 5 anos ............................. 5.9.2
--   mudança de grau de risco: redimensiona na próxima eleição ... 5.9.3
--
-- Nada aqui calcula dimensionamento: as faixas vêm do catálogo nr5_dimension_bands (0016).
-- Este schema só guarda quem ocupa o mandato e qual é a situação de cada vínculo.

CREATE TABLE sst.cipa_terms (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  -- Edição da NR-5 usada como referência nesta constituição.
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  term_number smallint NOT NULL CHECK (term_number >= 1),
  -- 'elected' = CIPA completa por processo eleitoral;
  -- 'designated' = CIPA designada por negociação coletiva (5.4.13);
  -- 'centralized' = CIPA centralizada de prestadora de serviços (5.8.1).
  constitution text NOT NULL CHECK (constitution IN ('elected', 'designated', 'centralized')),
  -- Grau de risco do estabelecimento na constituição (NR-4 / CNAE 2.0).
  risk_grade smallint NOT NULL CHECK (risk_grade BETWEEN 1 AND 4),
  employee_count integer NOT NULL CHECK (employee_count > 0),
  -- Faixa do Quadro I aplicada (referência auditável, não recalculada aqui).
  dimension_band_id text,
  started_on date NOT NULL,
  ends_on date NOT NULL,
  possession_on date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended', 'annulled')),
  -- Reeleição da mesma pessoa (controle de 5.4.6).
  previous_term_id text,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  ended_on date,
  end_reason text NOT NULL DEFAULT '' CHECK (length(end_reason) <= 600),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, company_id, unit_id, term_number),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, previous_term_id) REFERENCES sst.cipa_terms(tenant_id, id),
  FOREIGN KEY (dimension_band_id) REFERENCES sst.nr5_dimension_bands(id),
  CHECK (ends_on > started_on),
  CHECK (possession_on IS NULL OR possession_on >= started_on),
  CHECK ((status = 'ended') = (ended_on IS NOT NULL)),
  CHECK (status <> 'annulled' OR length(end_reason) > 0)
);

-- Uma única CIPA vigente por estabelecimento.
CREATE UNIQUE INDEX cipa_terms_one_active_idx
  ON sst.cipa_terms (tenant_id, company_id, unit_id) WHERE status = 'active';

CREATE INDEX cipa_terms_unit_idx ON sst.cipa_terms (tenant_id, company_id, unit_id, status);

CREATE TABLE sst.cipa_members (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  term_id text NOT NULL,
  -- Referência ao trabalhador já cadastrado (worker-store). Sem cadastro paralelo de pessoas.
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 1 AND 200),
  representation text NOT NULL CHECK (representation IN ('employer', 'employee')),
  role text NOT NULL CHECK (role IN ('president', 'vice_president', 'secretary', 'member')),
  -- Titular ou suplente.
  seat text NOT NULL CHECK (seat IN ('titular', 'suplente')),
  -- Ordem de suplência conforme ata de eleição, em ordem decrescente de votos (5.5.8).
  succession_order smallint CHECK (succession_order IS NULL OR succession_order >= 1),
  -- Origem do mandato do membro.
  mandate_source text NOT NULL CHECK (mandate_source IN ('elected', 'designated', 'named_representative')),
  elected_at date,
  votes_received integer CHECK (votes_received IS NULL OR votes_received >= 0),
  possession_on date,
  -- Estabilidade: da candidatura até 1 ano após o fim do mandato (5.4.12).
  candidacy_registered_on date,
  stability_until date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'ended')),
  -- Substituição e perda de mandato. 'replaced' também exige data de encerramento.
  replaced_by_member_id text,
  ended_on date,
  -- Perda de mandato por faltas (5.6.6): mais de 4 reuniões ordinárias sem justificativa.
  absences_unjustified smallint NOT NULL DEFAULT 0 CHECK (absences_unjustified >= 0),
  terminated_by_absence boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES sst.cipa_terms(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, replaced_by_member_id) REFERENCES sst.cipa_members(tenant_id, id),
  UNIQUE (tenant_id, term_id, worker_id, seat),
  -- Presidente e vice pertencem a representações distintas (5.4.5).
  CHECK (role NOT IN ('president', 'vice_president') OR seat = 'titular'),
  CHECK (role <> 'president' OR representation = 'employer'),
  CHECK (role <> 'vice_president' OR representation = 'employee'),
  -- Eleito exige data de eleição; designado exige designação.
  CHECK ((mandate_source = 'elected') = (elected_at IS NOT NULL)),
  CHECK (status = 'active' OR ended_on IS NOT NULL),
  CHECK (terminated_by_absence = (status = 'ended') OR terminated_by_absence = false)
);

-- Um único presidente, um único vice e um único secretário ativos por mandato.
CREATE UNIQUE INDEX cipa_members_one_president_idx
  ON sst.cipa_members (tenant_id, term_id) WHERE role = 'president' AND status = 'active';
CREATE UNIQUE INDEX cipa_members_one_vice_idx
  ON sst.cipa_members (tenant_id, term_id) WHERE role = 'vice_president' AND status = 'active';

CREATE INDEX cipa_members_term_idx ON sst.cipa_members (tenant_id, term_id, representation, seat, status);
CREATE INDEX cipa_members_stability_idx ON sst.cipa_members (tenant_id, stability_until) WHERE status = 'active';

-- Representante nomeado da NR-05 (5.4.13 e 5.8.2): estabelecimento fora do Quadro I e sem SESMT,
-- ou contratada desobrigada de CIPA própria com 5 ou mais empregados.
CREATE TABLE sst.cipa_named_representatives (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  standard_id text NOT NULL REFERENCES sst.nr5_standards(id) ON DELETE RESTRICT,
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 1 AND 200),
  -- Motivo da nomeação (5.4.13, 5.8.2 ou Anexo I 3.1.1/3.3.1).
  basis text NOT NULL CHECK (basis IN ('below_quadro_no_sesmt', 'contractor_no_own_cipa', 'construction_site', 'construction_front')),
  -- Nomeação formalizada anualmente (5.4.14).
  appointed_on date NOT NULL,
  valid_until date NOT NULL,
  appointment_document_id text CHECK (appointment_document_id IS NULL OR length(appointment_document_id) <= 200),
  -- Treinamento: mínimo 8h, reaproveitável por 24 meses (5.7.4.3 / Anexo I 3.5.1).
  training_completed_on date,
  training_valid_until date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_on date,
  end_reason text NOT NULL DEFAULT '' CHECK (length(end_reason) <= 600),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (valid_until > appointed_on),
  CHECK ((status = 'ended') = (ended_on IS NOT NULL)),
  CHECK (training_valid_until IS NULL OR training_completed_on IS NOT NULL)
);

-- Um representante nomeado ativo por estabelecimento e motivo.
CREATE UNIQUE INDEX cipa_named_reps_one_active_idx
  ON sst.cipa_named_representatives (tenant_id, company_id, unit_id, basis) WHERE status = 'active';

CREATE INDEX cipa_named_reps_unit_idx ON sst.cipa_named_representatives (tenant_id, company_id, unit_id, status);

-- Auditoria append-only das transições de CIPA.
CREATE TABLE sst.cipa_events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  term_id text,
  target_kind text NOT NULL CHECK (target_kind IN ('term', 'member', 'named_representative')),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  action text NOT NULL CHECK (action IN (
    'term.created', 'term.activated', 'term.ended', 'term.annulled',
    'member.added', 'member.replaced', 'member.ended', 'member.mandate_lost',
    'named_representative.appointed', 'named_representative.renewed', 'named_representative.ended'
  )),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES sst.cipa_terms(tenant_id, id)
);

CREATE INDEX cipa_events_term_idx ON sst.cipa_events (tenant_id, term_id, occurred_at);

-- Histórico imutável.
CREATE FUNCTION sst.reject_cipa_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico da CIPA é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER cipa_events_immutable BEFORE UPDATE OR DELETE ON sst.cipa_events
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_history_mutation();

-- Mandato encerrado e membro encerrado não voltam a ficar ativos (preserva histórico).
CREATE FUNCTION sst.reject_cipa_term_reopen() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status IN ('ended', 'annulled') AND NEW.status IN ('draft', 'active') THEN
    RAISE EXCEPTION 'Mandato encerrado ou anulado não pode ser reaberto'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER cipa_terms_no_reopen BEFORE UPDATE ON sst.cipa_terms
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_term_reopen();

-- 5.4.10: a CIPA não pode ter o número de representantes reduzido antes do fim do mandato.
CREATE FUNCTION sst.assert_cipa_member_not_removed() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  term_status text;
BEGIN
  SELECT status INTO term_status FROM sst.cipa_terms
   WHERE tenant_id = OLD.tenant_id AND id = OLD.term_id;

  IF TG_OP = 'DELETE' AND term_status IN ('active', 'draft') THEN
    RAISE EXCEPTION 'Membro de CIPA vigente não pode ser apagado; registre substituição ou encerramento (5.4.10)'
      USING ERRCODE = '55000';
  END IF;

  RETURN OLD;
END
$function$;

CREATE TRIGGER cipa_members_no_delete BEFORE DELETE ON sst.cipa_members
  FOR EACH ROW EXECUTE FUNCTION sst.assert_cipa_member_not_removed();

-- RLS nas tabelas por tenant.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cipa_terms', 'cipa_members', 'cipa_named_representatives', 'cipa_events'] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

-- A role do app atualiza o estado operacional, mas nunca apaga histórico.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cipa_terms', 'cipa_members', 'cipa_named_representatives'] LOOP
    EXECUTE format('GRANT UPDATE ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;
