-- Gate transacional de Terceiros. Aplicação no banco local requer checkpoint operacional.
-- Pré-requisitos: schema sst, tenants, client_companies e client_units.
-- Este modelo não recebe PDFs, ASOs ou conteúdo clínico.

CREATE TABLE sst.third_party_requirement_sets (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('active', 'superseded')),
  previous_set_id text,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, company_id, unit_id, revision),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id),
  FOREIGN KEY (tenant_id, previous_set_id) REFERENCES sst.third_party_requirement_sets(tenant_id, id),
  CHECK ((previous_set_id IS NULL AND revision = 1) OR (previous_set_id IS NOT NULL AND revision > 1))
);

CREATE UNIQUE INDEX third_party_requirement_sets_one_active_scope_idx
  ON sst.third_party_requirement_sets (tenant_id, company_id, unit_id) WHERE status = 'active';

CREATE TABLE sst.third_party_requirement_items (
  tenant_id text NOT NULL,
  requirement_set_id text NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'Outro', 'ASO')),
  medical_restricted boolean NOT NULL DEFAULT false,
  restricted_note text NOT NULL DEFAULT '' CHECK (length(restricted_note) <= 600),
  PRIMARY KEY (tenant_id, requirement_set_id, document_kind),
  FOREIGN KEY (tenant_id, requirement_set_id) REFERENCES sst.third_party_requirement_sets(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((document_kind = 'ASO') = medical_restricted),
  CHECK (document_kind = 'ASO' OR restricted_note = '')
);

CREATE TABLE sst.third_party_compliance_rules (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  document_kind text NOT NULL CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'Outro')),
  criteria text NOT NULL CHECK (length(criteria) BETWEEN 1 AND 12000),
  source_title text NOT NULL CHECK (length(source_title) BETWEEN 1 AND 240),
  source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 120),
  jurisdiction text NOT NULL CHECK (length(jurisdiction) BETWEEN 1 AND 120),
  valid_from date NOT NULL,
  valid_until date,
  reviewer text NOT NULL CHECK (length(reviewer) BETWEEN 1 AND 160),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('active', 'superseded')),
  previous_rule_id text,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, title, document_kind, version),
  FOREIGN KEY (tenant_id, previous_rule_id) REFERENCES sst.third_party_compliance_rules(tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CHECK ((previous_rule_id IS NULL AND version = 1) OR (previous_rule_id IS NOT NULL AND version > 1))
);

CREATE TABLE sst.third_party_document_evaluations (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  receipt_id text NOT NULL CHECK (length(receipt_id) BETWEEN 1 AND 200),
  document_kind text NOT NULL CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'Outro')),
  rule_id text NOT NULL,
  rule_version integer NOT NULL CHECK (rule_version > 0),
  result text NOT NULL CHECK (result IN ('atende', 'pendente', 'inconclusivo', 'nao_aplicavel')),
  notes text NOT NULL CHECK (length(notes) <= 12000),
  evidence text NOT NULL CHECK (length(evidence) <= 12000),
  evidence_document_id text NOT NULL CHECK (length(evidence_document_id) <= 200),
  responsible text NOT NULL CHECK (length(responsible) BETWEEN 1 AND 200),
  next_step text NOT NULL CHECK (length(next_step) <= 1200),
  evaluated_by text NOT NULL CHECK (length(evaluated_by) BETWEEN 1 AND 200),
  evaluator_role text NOT NULL CHECK (length(evaluator_role) BETWEEN 1 AND 80),
  evaluated_at timestamptz NOT NULL,
  rule_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  document_snapshot jsonb NOT NULL CHECK (jsonb_typeof(document_snapshot) = 'object'),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id),
  FOREIGN KEY (tenant_id, rule_id) REFERENCES sst.third_party_compliance_rules(tenant_id, id),
  CHECK ((rule_snapshot->>'id' = rule_id AND (rule_snapshot->>'version')::integer = rule_version AND document_snapshot->>'id' = receipt_id AND document_snapshot->>'kind' = document_kind) IS TRUE)
);

-- O escopo aponta para a futura projeção operacional de Terceiros. Não referencia snapshots de importação.
CREATE TABLE sst.third_party_integration_decisions (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  scope_id text NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  requirement_set_id text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  notes text NOT NULL CHECK (length(notes) BETWEEN 1 AND 1200),
  decided_by text NOT NULL CHECK (length(decided_by) BETWEEN 1 AND 200),
  decided_role text NOT NULL CHECK (length(decided_role) BETWEEN 1 AND 80),
  decided_at timestamptz NOT NULL,
  decision_snapshot jsonb NOT NULL CHECK (jsonb_typeof(decision_snapshot) = 'object'),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, scope_id, fingerprint),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES sst.client_units(tenant_id, id),
  FOREIGN KEY (tenant_id, requirement_set_id) REFERENCES sst.third_party_requirement_sets(tenant_id, id),
  CHECK ((decision_snapshot->>'fingerprint' = fingerprint AND decision_snapshot->>'scopeId' = scope_id) IS TRUE)
);

CREATE TABLE sst.third_party_integration_schedules (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  decision_id text NOT NULL,
  scheduled_on date NOT NULL,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, decision_id),
  FOREIGN KEY (tenant_id, decision_id) REFERENCES sst.third_party_integration_decisions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE sst.third_party_integration_audit (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  action text NOT NULL CHECK (action IN ('thirdparty.integration_approved', 'thirdparty.integration_scheduled')),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  actor_role text NOT NULL CHECK (length(actor_role) BETWEEN 1 AND 80),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE FUNCTION sst.reject_third_party_integration_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Third party integration history is append-only' USING ERRCODE = '55000';
END
$function$;

-- A chave existente de client_units é (tenant_id, id). Confere o vínculo com a empresa
-- sem exigir alteração no schema já ativo de Empresas.
CREATE FUNCTION sst.assert_third_party_gate_company_unit() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sst.client_units
    WHERE tenant_id = NEW.tenant_id AND id = NEW.unit_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to company in this tenant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$function$;

-- Uma nova versão somente pode retirar a vigência da anterior. O conteúdo histórico não muda.
CREATE FUNCTION sst.allow_third_party_supersede_only() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only active-to-superseded status transition is allowed' USING ERRCODE = '55000';
END
$function$;

DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'third_party_requirement_sets', 'third_party_requirement_items', 'third_party_compliance_rules',
    'third_party_document_evaluations', 'third_party_integration_decisions',
    'third_party_integration_schedules', 'third_party_integration_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

GRANT UPDATE (status) ON sst.third_party_requirement_sets, sst.third_party_compliance_rules TO sst_hoje_app;

CREATE TRIGGER requirement_set_history_supersede BEFORE UPDATE ON sst.third_party_requirement_sets
  FOR EACH ROW EXECUTE FUNCTION sst.allow_third_party_supersede_only();
CREATE TRIGGER requirement_set_history_no_delete BEFORE DELETE ON sst.third_party_requirement_sets
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER requirement_set_company_unit BEFORE INSERT ON sst.third_party_requirement_sets
  FOR EACH ROW EXECUTE FUNCTION sst.assert_third_party_gate_company_unit();
CREATE TRIGGER requirement_item_history_immutable BEFORE UPDATE OR DELETE ON sst.third_party_requirement_items
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER compliance_rule_history_supersede BEFORE UPDATE ON sst.third_party_compliance_rules
  FOR EACH ROW EXECUTE FUNCTION sst.allow_third_party_supersede_only();
CREATE TRIGGER compliance_rule_history_no_delete BEFORE DELETE ON sst.third_party_compliance_rules
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER compliance_evaluation_history_immutable BEFORE UPDATE OR DELETE ON sst.third_party_document_evaluations
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER compliance_evaluation_company_unit BEFORE INSERT ON sst.third_party_document_evaluations
  FOR EACH ROW EXECUTE FUNCTION sst.assert_third_party_gate_company_unit();
CREATE TRIGGER decision_history_immutable BEFORE UPDATE OR DELETE ON sst.third_party_integration_decisions
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER decision_company_unit BEFORE INSERT ON sst.third_party_integration_decisions
  FOR EACH ROW EXECUTE FUNCTION sst.assert_third_party_gate_company_unit();
CREATE TRIGGER schedule_history_immutable BEFORE UPDATE OR DELETE ON sst.third_party_integration_schedules
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
CREATE TRIGGER audit_history_immutable BEFORE UPDATE OR DELETE ON sst.third_party_integration_audit
  FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_integration_history_mutation();
