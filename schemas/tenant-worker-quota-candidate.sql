-- Candidate only. Depends on tenant-authority-candidate.sql and
-- tenant-self-service-identity-candidate.sql; never apply to a persistent DB.
CREATE SCHEMA tenant_worker_candidate;
CREATE ROLE tenant_worker_candidate_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE TABLE tenant_worker_candidate.workers (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(trim(id)) BETWEEN 1 AND 200),
  company_id text NOT NULL,
  unit_id text NOT NULL,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  sex text NOT NULL DEFAULT 'Não informado'
    CHECK (sex IN ('Feminino','Masculino','Não informado')),
  job_title text NOT NULL CHECK (length(trim(job_title)) BETWEEN 1 AND 120),
  area text CHECK (area IS NULL OR length(area) <= 120),
  risk_categories text[] NOT NULL CHECK (
    cardinality(risk_categories) > 0
    AND risk_categories <@ ARRAY['Ruído','Ergonômico','Químico','Biológico','Acidente','Outro']::text[]
  ),
  nr35_training_status text NOT NULL DEFAULT 'not_informed'
    CHECK (nr35_training_status IN ('not_informed','reported_pending_validation')),
  height_work_supervision_training_status text NOT NULL DEFAULT 'not_informed'
    CHECK (height_work_supervision_training_status IN ('not_informed','reported_pending_validation')),
  scaffolding_assembly_training_status text NOT NULL DEFAULT 'not_informed'
    CHECK (scaffolding_assembly_training_status IN ('not_informed','reported_pending_validation')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,company_id)
    REFERENCES sst.client_companies(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,unit_id,company_id)
    REFERENCES sst.client_units(tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE INDEX tenant_worker_active_quota_idx
  ON tenant_worker_candidate.workers(tenant_id) WHERE status = 'active';

CREATE TABLE tenant_worker_candidate.worker_history (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(trim(id)) BETWEEN 1 AND 200),
  worker_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created','details_changed','status_changed')),
  actor_user_id text NOT NULL CHECK (length(trim(actor_user_id)) BETWEEN 1 AND 200),
  actor_role text NOT NULL CHECK (actor_role IN (
    'consultoria_admin','sst_tst','cliente','terceiro',
    'profissional_habilitado','medico_coordenador','saas_master'
  )),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  from_status text CHECK (from_status IS NULL OR from_status IN ('active','archived')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('active','archived')),
  changed_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,worker_id)
    REFERENCES tenant_worker_candidate.workers(tenant_id,id) ON DELETE RESTRICT,
  CHECK (
    (action = 'created' AND from_status IS NULL AND to_status = 'active' AND cardinality(changed_fields) = 0)
    OR (action = 'status_changed' AND from_status IS NOT NULL AND to_status IS NOT NULL
      AND from_status <> to_status AND cardinality(changed_fields) = 0)
    OR (action = 'details_changed' AND from_status IS NULL AND to_status IS NULL
      AND cardinality(changed_fields) > 0
      AND changed_fields <@ ARRAY[
        'displayName','sex','jobTitle','area','riskCategories',
        'nr35TrainingStatus','heightWorkSupervisionTrainingStatus','scaffoldingAssemblyTrainingStatus'
      ]::text[])
  )
);
CREATE INDEX tenant_worker_history_order_idx
  ON tenant_worker_candidate.worker_history(tenant_id,worker_id,occurred_at,id);

CREATE FUNCTION tenant_worker_candidate.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'worker history is append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER worker_history_append_only
  BEFORE UPDATE OR DELETE ON tenant_worker_candidate.worker_history
  FOR EACH ROW EXECUTE FUNCTION tenant_worker_candidate.reject_history_mutation();

ALTER TABLE tenant_worker_candidate.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_candidate.workers FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_candidate.worker_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_candidate.worker_history FORCE ROW LEVEL SECURITY;
CREATE POLICY workers_current_tenant ON tenant_worker_candidate.workers
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));
CREATE POLICY worker_history_current_tenant ON tenant_worker_candidate.worker_history
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));

REVOKE ALL ON ALL TABLES IN SCHEMA tenant_worker_candidate FROM PUBLIC,tenant_worker_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tenant_worker_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA tenant_worker_candidate TO tenant_worker_candidate_app;

CREATE FUNCTION tenant_worker_candidate.create_worker(
  worker_id text,
  company_key text,
  unit_key text,
  submitted_display_name text,
  submitted_sex text,
  submitted_job_title text,
  submitted_area text,
  submitted_risk_categories text[],
  history_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  actor_role text;
  profile tenant_identity_candidate.tenant_profiles%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(worker_id,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(company_key,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(unit_key,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(submitted_display_name,''))) NOT BETWEEN 1 AND 200
     OR submitted_sex NOT IN ('Feminino','Masculino','Não informado')
     OR length(trim(coalesce(submitted_job_title,''))) NOT BETWEEN 1 AND 120
     OR length(coalesce(submitted_area,'')) > 120
     OR submitted_risk_categories IS NULL OR cardinality(submitted_risk_categories) = 0
     OR NOT (submitted_risk_categories <@ ARRAY['Ruído','Ergonômico','Químico','Biológico','Acidente','Outro']::text[])
     OR length(trim(coalesce(history_id,''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Dados do trabalhador inválidos.';
  END IF;
  SELECT * INTO profile FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  SELECT role INTO actor_role FROM sst.tenant_memberships AS membership
    JOIN sst.tenants AS tenant ON tenant.id = membership.tenant_id
    WHERE membership.tenant_id = tenant_key AND membership.user_id = actor_key
      AND membership.status = 'active' AND tenant.status = 'active' FOR SHARE OF membership,tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership ativa não encontrada neste tenant.'; END IF;
  IF actor_role NOT IN ('consultoria_admin','sst_tst')
     AND NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
       WHERE tenant_id = tenant_key AND user_id = actor_key AND active
         AND role IN ('tenant_owner','tenant_admin')) THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar trabalhadores neste tenant.';
  END IF;
  IF (SELECT count(*) FROM tenant_worker_candidate.workers
      WHERE tenant_id = tenant_key AND status = 'active') >= profile.worker_limit THEN
    RAISE EXCEPTION 'Limite de trabalhadores ativos atingido.';
  END IF;
  INSERT INTO tenant_worker_candidate.workers(
    tenant_id,id,company_id,unit_id,display_name,sex,job_title,area,risk_categories
  ) VALUES (
    tenant_key,worker_id,company_key,unit_key,trim(submitted_display_name),
    submitted_sex,trim(submitted_job_title),nullif(trim(coalesce(submitted_area,'')),''),
    submitted_risk_categories
  );
  INSERT INTO tenant_worker_candidate.worker_history(
    tenant_id,id,worker_id,action,actor_user_id,actor_role,to_status
  ) VALUES (tenant_key,history_id,worker_id,'created',actor_key,actor_role,'active');
  RETURN worker_id;
END
$$;

CREATE FUNCTION tenant_worker_candidate.set_worker_status(
  worker_key text,
  submitted_status text,
  history_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  actor_role text;
  current_status text;
  profile tenant_identity_candidate.tenant_profiles%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR submitted_status NOT IN ('active','archived')
     OR length(trim(coalesce(worker_key,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(history_id,''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Sessão e estado do trabalhador válidos são obrigatórios.';
  END IF;
  SELECT * INTO profile FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  SELECT role INTO actor_role FROM sst.tenant_memberships AS membership
    JOIN sst.tenants AS tenant ON tenant.id = membership.tenant_id
    WHERE membership.tenant_id = tenant_key AND membership.user_id = actor_key
      AND membership.status = 'active' AND tenant.status = 'active' FOR SHARE OF membership,tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership ativa não encontrada neste tenant.'; END IF;
  IF actor_role NOT IN ('consultoria_admin','sst_tst')
     AND NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
       WHERE tenant_id = tenant_key AND user_id = actor_key AND active
         AND role IN ('tenant_owner','tenant_admin')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar trabalhadores neste tenant.';
  END IF;
  SELECT status INTO current_status FROM tenant_worker_candidate.workers
    WHERE tenant_id = tenant_key AND id = worker_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabalhador não encontrado neste tenant.'; END IF;
  IF current_status = submitted_status THEN RETURN false; END IF;
  IF submitted_status = 'active'
     AND (SELECT count(*) FROM tenant_worker_candidate.workers
       WHERE tenant_id = tenant_key AND status = 'active') >= profile.worker_limit THEN
    RAISE EXCEPTION 'Limite de trabalhadores ativos atingido.';
  END IF;
  UPDATE tenant_worker_candidate.workers SET status = submitted_status,updated_at = clock_timestamp()
    WHERE tenant_id = tenant_key AND id = worker_key;
  INSERT INTO tenant_worker_candidate.worker_history(
    tenant_id,id,worker_id,action,actor_user_id,actor_role,from_status,to_status
  ) VALUES (
    tenant_key,history_id,worker_key,'status_changed',actor_key,actor_role,current_status,submitted_status
  );
  RETURN true;
END
$$;

CREATE FUNCTION tenant_worker_candidate.update_worker_details(
  worker_key text,
  submitted_display_name text,
  submitted_sex text,
  submitted_job_title text,
  submitted_area text,
  submitted_risk_categories text[],
  submitted_nr35_status text,
  submitted_height_supervision_status text,
  submitted_scaffolding_status text,
  history_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  actor_role text;
  current_worker tenant_worker_candidate.workers%ROWTYPE;
  changed text[] := ARRAY[]::text[];
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(worker_key,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(submitted_display_name,''))) NOT BETWEEN 1 AND 200
     OR submitted_sex IS NULL OR submitted_sex NOT IN ('Feminino','Masculino','Não informado')
     OR length(trim(coalesce(submitted_job_title,''))) NOT BETWEEN 1 AND 120
     OR length(coalesce(submitted_area,'')) > 120
     OR submitted_risk_categories IS NULL OR cardinality(submitted_risk_categories) = 0
     OR NOT (submitted_risk_categories <@ ARRAY['Ruído','Ergonômico','Químico','Biológico','Acidente','Outro']::text[])
     OR submitted_nr35_status IS NULL
       OR submitted_nr35_status NOT IN ('not_informed','reported_pending_validation')
     OR submitted_height_supervision_status IS NULL
       OR submitted_height_supervision_status NOT IN ('not_informed','reported_pending_validation')
     OR submitted_scaffolding_status IS NULL
       OR submitted_scaffolding_status NOT IN ('not_informed','reported_pending_validation')
     OR length(trim(coalesce(history_id,''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Dados do trabalhador inválidos.';
  END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  SELECT role INTO actor_role FROM sst.tenant_memberships AS membership
    JOIN sst.tenants AS tenant ON tenant.id = membership.tenant_id
    WHERE membership.tenant_id = tenant_key AND membership.user_id = actor_key
      AND membership.status = 'active' AND tenant.status = 'active'
    FOR SHARE OF membership,tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership ativa não encontrada neste tenant.'; END IF;
  IF actor_role NOT IN ('consultoria_admin','sst_tst')
     AND NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
       WHERE tenant_id = tenant_key AND user_id = actor_key AND active
         AND role IN ('tenant_owner','tenant_admin')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar trabalhadores neste tenant.';
  END IF;
  SELECT * INTO current_worker FROM tenant_worker_candidate.workers
    WHERE tenant_id = tenant_key AND id = worker_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabalhador não encontrado neste tenant.'; END IF;
  IF current_worker.display_name IS DISTINCT FROM trim(submitted_display_name) THEN
    changed := array_append(changed,'displayName');
  END IF;
  IF current_worker.sex IS DISTINCT FROM submitted_sex THEN changed := array_append(changed,'sex'); END IF;
  IF current_worker.job_title IS DISTINCT FROM trim(submitted_job_title) THEN
    changed := array_append(changed,'jobTitle');
  END IF;
  IF current_worker.area IS DISTINCT FROM nullif(trim(coalesce(submitted_area,'')),'') THEN
    changed := array_append(changed,'area');
  END IF;
  IF current_worker.risk_categories IS DISTINCT FROM submitted_risk_categories THEN
    changed := array_append(changed,'riskCategories');
  END IF;
  IF current_worker.nr35_training_status IS DISTINCT FROM submitted_nr35_status THEN
    changed := array_append(changed,'nr35TrainingStatus');
  END IF;
  IF current_worker.height_work_supervision_training_status IS DISTINCT FROM submitted_height_supervision_status THEN
    changed := array_append(changed,'heightWorkSupervisionTrainingStatus');
  END IF;
  IF current_worker.scaffolding_assembly_training_status IS DISTINCT FROM submitted_scaffolding_status THEN
    changed := array_append(changed,'scaffoldingAssemblyTrainingStatus');
  END IF;
  IF cardinality(changed) = 0 THEN RETURN false; END IF;
  UPDATE tenant_worker_candidate.workers SET
    display_name = trim(submitted_display_name),
    sex = submitted_sex,
    job_title = trim(submitted_job_title),
    area = nullif(trim(coalesce(submitted_area,'')),''),
    risk_categories = submitted_risk_categories,
    nr35_training_status = submitted_nr35_status,
    height_work_supervision_training_status = submitted_height_supervision_status,
    scaffolding_assembly_training_status = submitted_scaffolding_status,
    updated_at = clock_timestamp()
    WHERE tenant_id = tenant_key AND id = worker_key;
  INSERT INTO tenant_worker_candidate.worker_history(
    tenant_id,id,worker_id,action,actor_user_id,actor_role,changed_fields
  ) VALUES (
    tenant_key,history_id,worker_key,'details_changed',actor_key,actor_role,changed
  );
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION tenant_worker_candidate.create_worker(text,text,text,text,text,text,text,text[],text),
  tenant_worker_candidate.set_worker_status(text,text,text),
  tenant_worker_candidate.update_worker_details(text,text,text,text,text,text[],text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_worker_candidate.create_worker(text,text,text,text,text,text,text,text[],text),
  tenant_worker_candidate.set_worker_status(text,text,text),
  tenant_worker_candidate.update_worker_details(text,text,text,text,text,text[],text,text,text,text)
  TO tenant_worker_candidate_app;
