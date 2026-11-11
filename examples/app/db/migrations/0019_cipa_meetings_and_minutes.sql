-- NR-5 (CIPA) — Fase 5: funcionamento — reuniões, atas, assinaturas, deliberações e faltas.
--
-- Base normativa: NR-05 atualizada 2022 (Portaria MTP nº 4.219/2022).
--   reuniões ordinárias mensais, calendário preestabelecido ................. 5.6.1
--   ME/EPP graus de risco 1 e 2 podem ser bimestrais ....................... 5.6.1.1
--   presencial preferencial, participação remota permitida ................. 5.6.2
--   data e horário acordados observando turnos e jornadas .................. 5.6.2.1
--   atas assinadas pelos presentes ........................................ 5.6.3
--   atas disponibilizadas a todos os integrantes .......................... 5.6.3.1
--   deliberações em quadro de aviso ou meio eletrônico .................... 5.6.3.2
--   extraordinária: acidente grave/fatal ou solicitação de uma representação 5.6.4
--   secretário designado por reunião para redigir a ata .................... 5.6.5
--   perda de mandato: faltar a mais de 4 ordinárias sem justificativa ...... 5.6.6
--   vacância suprida por suplente, motivos em ata ......................... 5.6.7
--   decisões preferencialmente por consenso ............................... 5.6.8
--   sem consenso: a CIPA regula votação e reconsideração .................. 5.6.8.1
--   documentação mantida por no mínimo 5 anos ............................. 5.9.2

CREATE TABLE sst.cipa_meetings (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  term_id text NOT NULL,
  meeting_type text NOT NULL CHECK (meeting_type IN ('ordinary', 'extraordinary')),
  -- Sequência da reunião dentro do mandato (permite contar faltas em ordinárias).
  sequence smallint NOT NULL CHECK (sequence >= 1),
  scheduled_for timestamptz NOT NULL,
  held_at timestamptz,
  -- 'in_person' | 'hybrid' | 'remote' (5.6.2).
  modality text NOT NULL DEFAULT 'in_person' CHECK (modality IN ('in_person', 'hybrid', 'remote')),
  -- Gatilho da extraordinária (5.6.4).
  extraordinary_reason text CHECK (
    extraordinary_reason IS NULL OR extraordinary_reason IN ('serious_or_fatal_accident', 'representation_request')
  ),
  -- Secretário designado para redigir a ata (5.6.5).
  secretary_member_id text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'cancelled')),
  -- Decisão da reunião (5.6.8 / 5.6.8.1).
  decision_mode text CHECK (decision_mode IS NULL OR decision_mode IN ('consensus', 'voted', 'pending')),
  -- Deliberações divulgadas aos empregados (5.6.3.2).
  deliberations_published_at timestamptz,
  deliberations_channel text NOT NULL DEFAULT '' CHECK (length(deliberations_channel) <= 200),
  cancelled_reason text NOT NULL DEFAULT '' CHECK (length(cancelled_reason) <= 600),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES sst.cipa_terms(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, secretary_member_id) REFERENCES sst.cipa_members(tenant_id, id),
  UNIQUE (tenant_id, term_id, sequence),
  -- Reunião realizada exige data de realização; cancelada exige motivo.
  CHECK (status <> 'held' OR held_at IS NOT NULL),
  CHECK (status <> 'cancelled' OR length(cancelled_reason) > 0),
  -- Extraordinária exige gatilho; ordinária não o possui.
  CHECK ((meeting_type = 'extraordinary') = (extraordinary_reason IS NOT NULL))
);

CREATE INDEX cipa_meetings_term_idx ON sst.cipa_meetings (tenant_id, term_id, scheduled_for);

-- Presenças e faltas por reunião (base do 5.6.6).
CREATE TABLE sst.cipa_meeting_attendance (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  meeting_id text NOT NULL,
  member_id text NOT NULL,
  -- 'present' | 'absent' | 'absent_justified' | 'remote'
  attendance text NOT NULL CHECK (attendance IN ('present', 'absent', 'absent_justified', 'remote')),
  justification text NOT NULL DEFAULT '' CHECK (length(justification) <= 600),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, meeting_id, member_id),
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES sst.cipa_meetings(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, member_id) REFERENCES sst.cipa_members(tenant_id, id) ON DELETE RESTRICT,
  -- Falta justificada exige justificativa.
  CHECK (attendance <> 'absent_justified' OR length(justification) > 0)
);

-- Ata: uma por reunião realizada.
CREATE TABLE sst.cipa_minutes (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  meeting_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 40000),
  written_by text NOT NULL CHECK (length(written_by) BETWEEN 1 AND 200),
  -- Documento versionado anexado (document-store), quando houver PDF.
  document_id text,
  -- Disponível a todos os integrantes (5.6.3.1).
  distributed_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'superseded')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES sst.cipa_meetings(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, meeting_id, revision)
);

-- Uma única ata vigente por reunião.
CREATE UNIQUE INDEX cipa_minutes_one_current_idx
  ON sst.cipa_minutes (tenant_id, meeting_id) WHERE status IN ('draft', 'final');

-- Assinaturas dos presentes na ata (5.6.3).
CREATE TABLE sst.cipa_minute_signatures (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  minute_id text NOT NULL,
  signer_kind text NOT NULL CHECK (signer_kind IN ('member', 'invited')),
  -- member_id quando signer_kind = 'member'; nome declarado quando 'invited'.
  member_id text,
  signer_name text NOT NULL CHECK (length(signer_name) BETWEEN 1 AND 200),
  signed_at timestamptz NOT NULL,
  -- Evidência do aceite: hash do conteúdo assinado.
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, minute_id, signer_kind, signer_name),
  FOREIGN KEY (tenant_id, minute_id) REFERENCES sst.cipa_minutes(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, member_id) REFERENCES sst.cipa_members(tenant_id, id),
  CHECK ((signer_kind = 'member') = (member_id IS NOT NULL))
);

-- Deliberações e encaminhamentos da reunião.
CREATE TABLE sst.cipa_actions (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  meeting_id text NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  -- Responsável: membro da CIPA ou nome declarado.
  responsible_member_id text,
  responsible_name text NOT NULL DEFAULT '' CHECK (length(responsible_name) <= 200),
  due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  completed_on date,
  evidence text NOT NULL DEFAULT '' CHECK (length(evidence) <= 2000),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES sst.cipa_meetings(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, responsible_member_id) REFERENCES sst.cipa_members(tenant_id, id),
  -- Precisa de um responsável identificável.
  CHECK (responsible_member_id IS NOT NULL OR length(responsible_name) > 0),
  CHECK (status <> 'done' OR completed_on IS NOT NULL)
);

CREATE INDEX cipa_actions_meeting_idx ON sst.cipa_actions (tenant_id, meeting_id, status);
CREATE INDEX cipa_actions_due_idx ON sst.cipa_actions (tenant_id, due_on) WHERE status IN ('open', 'in_progress');

-- Fatos de governança da reunião, imutáveis (perda de mandato, substituição, divulgação).
CREATE TABLE sst.cipa_meeting_events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  meeting_id text NOT NULL,
  action text NOT NULL CHECK (action IN (
    'meeting.held', 'meeting.cancelled', 'minutes.finalized', 'deliberations.published',
    'mandate.lost_by_absence', 'member.replaced', 'consensus.recorded', 'vote.recorded'
  )),
  subject_member_id text,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES sst.cipa_meetings(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, subject_member_id) REFERENCES sst.cipa_members(tenant_id, id)
);

CREATE INDEX cipa_meeting_events_idx ON sst.cipa_meeting_events (tenant_id, meeting_id, occurred_at);

-- Histórico imutável.
CREATE FUNCTION sst.reject_cipa_meeting_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Histórico de reuniões da CIPA é imutável (%)', TG_OP
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER cipa_meeting_events_immutable BEFORE UPDATE OR DELETE ON sst.cipa_meeting_events
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_meeting_history_mutation();

-- Ata finalizada e assinada não pode ser reescrita; use nova revisão.
CREATE FUNCTION sst.reject_cipa_minutes_rewrite() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'final' THEN
    RAISE EXCEPTION 'Ata finalizada não pode ser alterada; crie nova revisão'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER cipa_minutes_no_rewrite BEFORE UPDATE ON sst.cipa_minutes
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_minutes_rewrite();

-- Reunião realizada não volta a agendada; cancelada não volta a agendada.
CREATE FUNCTION sst.reject_cipa_meeting_reopen() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status IN ('held', 'cancelled') AND NEW.status = 'scheduled' THEN
    RAISE EXCEPTION 'Reunião realizada ou cancelada não pode voltar a agendada'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER cipa_meetings_no_reopen BEFORE UPDATE ON sst.cipa_meetings
  FOR EACH ROW EXECUTE FUNCTION sst.reject_cipa_meeting_reopen();

-- RLS nas tabelas por tenant.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cipa_meetings', 'cipa_meeting_attendance', 'cipa_minutes',
    'cipa_minute_signatures', 'cipa_actions', 'cipa_meeting_events'
  ] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;

-- Operação corrente: agendar, registrar presença, redigir ata, andar com ações.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cipa_meetings', 'cipa_meeting_attendance', 'cipa_minutes', 'cipa_actions'
  ] LOOP
    EXECUTE format('GRANT UPDATE ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;
