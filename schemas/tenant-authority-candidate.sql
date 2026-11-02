-- M22: candidato de hierarquia administrativa e principals de aplicativos.
-- Nao e migration. Aplicar somente em PostgreSQL descartavel para prova.
-- Dependencias esperadas: sst.tenant_memberships, sst.client_companies,
-- sst.client_units e funcao auth/sessao confiavel definida pelo host.
CREATE SCHEMA tenant_authority_candidate;
CREATE ROLE tenant_authority_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Um tenant opera como consultoria ou cliente direto. A plataforma provisiona
-- o estado inicial; mudar o modo nao muda o administrador nem amplia poderes.
CREATE TABLE tenant_authority_candidate.tenant_profiles (
  tenant_id text PRIMARY KEY REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  operating_mode text NOT NULL CHECK (operating_mode IN ('consultancy','direct_client')),
  admin_grant_limit integer NOT NULL DEFAULT 100 CHECK (admin_grant_limit BETWEEN 1 AND 5000),
  application_limit integer NOT NULL DEFAULT 20 CHECK (application_limit BETWEEN 0 AND 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Teto de delegacao independente dos grants de decisao. O teto aqui contem
-- somente papis administrativos de tenant; nunca saas_master.
CREATE TABLE tenant_authority_candidate.admin_grants (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('tenant_owner','tenant_admin','hierarchy_admin')),
  company_id text,
  unit_id text,
  active boolean NOT NULL DEFAULT true,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by text,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES sst.tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id),
  FOREIGN KEY (tenant_id,unit_id) REFERENCES sst.client_units(tenant_id,id),
  CHECK ((unit_id IS NULL OR company_id IS NOT NULL) AND
    (active AND revoked_by IS NULL AND revoked_at IS NULL OR
     NOT active AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_tenant_admin_grant
  ON tenant_authority_candidate.admin_grants(tenant_id,user_id,role,COALESCE(company_id,''),COALESCE(unit_id,''))
  WHERE active;

-- Integracao e principal de maquina. As permissoes sao uma allowlist de acoes,
-- nunca um papel humano. Guardar hash/identificador do segredo fora do schema
-- ou fazer hash no provedor; nunca persistir segredo em texto puro.
CREATE TABLE tenant_authority_candidate.application_principals (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  credential_fingerprint text NOT NULL,
  allowed_actions text[] NOT NULL CHECK (cardinality(allowed_actions) > 0),
  company_id text,
  unit_id text,
  third_party_id text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  calls_limit_per_minute integer NOT NULL CHECK (calls_limit_per_minute BETWEEN 1 AND 600),
  calls_limit_per_day integer NOT NULL CHECK (calls_limit_per_day BETWEEN 1 AND 1000000),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,credential_fingerprint),
  FOREIGN KEY (tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id),
  FOREIGN KEY (tenant_id,unit_id) REFERENCES sst.client_units(tenant_id,id),
  CHECK (unit_id IS NULL OR company_id IS NOT NULL),
  CHECK (third_party_id IS NULL OR company_id IS NOT NULL)
);
CREATE TABLE tenant_authority_candidate.events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('admin_grant','application_principal','tenant_profile')),
  subject_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created','changed','revoked')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE tenant_authority_candidate.application_usage (
  tenant_id text NOT NULL,
  principal_id uuid NOT NULL,
  minute_bucket timestamptz NOT NULL,
  day_bucket date NOT NULL,
  calls_minute integer NOT NULL DEFAULT 0 CHECK (calls_minute >= 0),
  calls_day integer NOT NULL DEFAULT 0 CHECK (calls_day >= 0),
  PRIMARY KEY (tenant_id,principal_id,minute_bucket,day_bucket),
  FOREIGN KEY (tenant_id,principal_id)
    REFERENCES tenant_authority_candidate.application_principals(tenant_id,id)
);

ALTER TABLE tenant_authority_candidate.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.tenant_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.admin_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.admin_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.application_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.application_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.events FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.application_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_authority_candidate.application_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON tenant_authority_candidate.tenant_profiles
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY tenant_scope ON tenant_authority_candidate.admin_grants
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY tenant_scope ON tenant_authority_candidate.application_principals
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY tenant_scope ON tenant_authority_candidate.events
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));
CREATE POLICY tenant_scope ON tenant_authority_candidate.application_usage
  USING (tenant_id=current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('sst.tenant_id',true));

REVOKE ALL ON ALL TABLES IN SCHEMA tenant_authority_candidate FROM PUBLIC,tenant_authority_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tenant_authority_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA tenant_authority_candidate TO tenant_authority_candidate_app;

-- A hierarquia inicial e provisionada somente pelo operador de onboarding
-- confiavel, apos autenticar a titularidade e o principal na origem externa.
-- Cliente direto recebe tenant_admin + tenant_owner (teto de delegacao);
-- consultoria recebe tenant_admin somente se o membership inicial for
-- consultoria_admin. Conta cliente atendida nao vira admin da consultoria.
-- Nao conceder EXECUTE desta funcao ao runtime.
CREATE FUNCTION tenant_authority_candidate.bootstrap_tenant(
  target_tenant_id text, target_mode text, initial_admin_user_id text, initial_admin_display_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  previous_tenant_id text := current_setting('sst.tenant_id',true);
  previous_user_id text := current_setting('sst.user_id',true);
  tenant_status text;
  initial_role text;
BEGIN
  IF target_tenant_id IS NULL OR target_mode IS NULL
     OR target_mode NOT IN ('consultancy','direct_client')
     OR initial_admin_user_id IS NULL OR length(trim(initial_admin_user_id)) NOT BETWEEN 1 AND 200
     OR initial_admin_display_name IS NULL
     OR length(trim(initial_admin_display_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Tenant, titularidade e administrador inicial validos sao obrigatorios.';
  END IF;

  -- O tenant e a conta no provedor de identidade devem existir antes. A
  -- titularidade/modo recebido precisa vir de onboarding confiavel; a funcao
  -- cria perfil, membership e grants administrativos numa unica transacao.
  PERFORM set_config('sst.tenant_id',target_tenant_id,true);
  SELECT status INTO tenant_status FROM sst.tenants WHERE id=target_tenant_id FOR SHARE;
  IF tenant_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Tenant deve existir e estar ativo antes do bootstrap.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=target_tenant_id) THEN
    RAISE EXCEPTION 'Tenant ja possui perfil administrativo provisionado.';
  END IF;
  IF EXISTS (SELECT 1 FROM sst.tenant_memberships
      WHERE tenant_id=target_tenant_id AND user_id=initial_admin_user_id) THEN
    RAISE EXCEPTION 'Membership inicial ja existe; bootstrap nao altera ou eleva papel existente.';
  END IF;

  INSERT INTO tenant_authority_candidate.tenant_profiles(tenant_id,operating_mode)
    VALUES (target_tenant_id,target_mode);

  INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name)
    VALUES (target_tenant_id,initial_admin_user_id,
      CASE target_mode WHEN 'consultancy' THEN 'consultoria_admin' ELSE 'cliente' END,
      'active',trim(initial_admin_display_name));
  PERFORM set_config('sst.user_id',initial_admin_user_id,true);
  SELECT m.role INTO initial_role FROM sst.tenant_memberships AS m
   WHERE m.tenant_id=target_tenant_id AND m.user_id=initial_admin_user_id AND m.status='active'
   FOR SHARE;
  IF initial_role IS DISTINCT FROM (
     CASE target_mode WHEN 'consultancy' THEN 'consultoria_admin' ELSE 'cliente' END
  ) THEN
    RAISE EXCEPTION 'Papel inicial nao corresponde ao modo/titularidade do tenant.';
  END IF;

  INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
    VALUES (target_tenant_id,initial_admin_user_id,'tenant_admin','trusted_onboarding');
  IF target_mode='direct_client' THEN
    INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
      VALUES (target_tenant_id,initial_admin_user_id,'tenant_owner','trusted_onboarding');
  END IF;
  INSERT INTO tenant_authority_candidate.events(
    tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot
  ) VALUES (
    target_tenant_id,'trusted_onboarding','tenant_profile',target_tenant_id,'created',
    'Titularidade validada pelo provisionador confiavel.',
    jsonb_build_object('operatingMode',target_mode,'initialAdminUserId',initial_admin_user_id,
      'membershipRole',initial_role,'adminGrant','tenant_admin',
      'ownerGrant',target_mode='direct_client')
  );
  PERFORM set_config('sst.tenant_id',coalesce(previous_tenant_id,''),true);
  PERFORM set_config('sst.user_id',coalesce(previous_user_id,''),true);
END $$;
REVOKE ALL ON FUNCTION tenant_authority_candidate.bootstrap_tenant(text,text,text,text)
  FROM PUBLIC,tenant_authority_candidate_app;

-- Enforcement operacional do ciclo de membership, sem cota comercial de assentos.
-- O caller ainda precisa provisionar a conta autenticada fora desta tabela.
CREATE FUNCTION tenant_authority_candidate.guard_membership_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  grant_row tenant_authority_candidate.admin_grants%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Membership nao pode ser movido entre tenants.';
  END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles
    WHERE tenant_id=NEW.tenant_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil de tenant ainda nao provisionado.'; END IF;
  IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM 1 FROM sst.tenants WHERE id=NEW.tenant_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' AND NEW.status='suspended' THEN
    FOR grant_row IN SELECT * FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id=OLD.tenant_id AND user_id=OLD.user_id AND active FOR UPDATE
    LOOP
      UPDATE tenant_authority_candidate.admin_grants
        SET active=false,revoked_by='membership_lifecycle',revoked_at=clock_timestamp()
        WHERE tenant_id=grant_row.tenant_id AND id=grant_row.id;
      INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
        VALUES (OLD.tenant_id,'membership_lifecycle','admin_grant',grant_row.id::text,'revoked',
          'Conta suspensa; concessao administrativa revogada.',
          jsonb_build_object('userId',OLD.user_id,'role',grant_row.role,'companyId',grant_row.company_id,
            'unitId',grant_row.unit_id,'grantRevokedWithMembership',true));
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tenant_authority_candidate.guard_membership_lifecycle() FROM PUBLIC,tenant_authority_candidate_app;
CREATE TRIGGER tenant_authority_membership_guard
  BEFORE INSERT OR UPDATE OF tenant_id,status ON sst.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION tenant_authority_candidate.guard_membership_lifecycle();

-- Escada administrativa estrita: owner > admin > hierarchy admin. Um ator
-- somente pode criar autoridade estritamente inferior a um grant que possui.
CREATE FUNCTION tenant_authority_candidate.grant_admin(
  target_user_id text, target_role text, target_company_id text, target_unit_id text, reason_text text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  actor_level integer;
  target_level integer;
  new_id uuid;
  snap jsonb;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR target_user_id IS NULL
     OR target_role NOT IN ('tenant_admin','hierarchy_admin')
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessao, papel delegado e justificativa validos sao obrigatorios.';
  END IF;
  IF actor_key=target_user_id THEN RAISE EXCEPTION 'Autoatribuicao administrativa negada.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles
    WHERE tenant_id=tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ausente ou inativo.'; END IF;
  IF (SELECT count(*) FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id=tenant_key AND active) >=
     (SELECT admin_grant_limit FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key) THEN
    RAISE EXCEPTION 'Limite de grants administrativos do tenant atingido.';
  END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concedente sem conta ativa.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=target_user_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario alvo deve estar cadastrado e ativo no tenant.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active
      AND (company_id IS NULL OR company_id=target_company_id)
      AND (unit_id IS NULL OR unit_id=target_unit_id) FOR SHARE;
  SELECT max(CASE role WHEN 'tenant_owner' THEN 3 WHEN 'tenant_admin' THEN 2 ELSE 1 END)
    INTO actor_level FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active
      AND (company_id IS NULL OR company_id=target_company_id)
      AND (unit_id IS NULL OR unit_id=target_unit_id);
  target_level := CASE target_role WHEN 'tenant_admin' THEN 2 ELSE 1 END;
  IF actor_level IS NULL OR actor_level <= target_level THEN
    RAISE EXCEPTION 'Delegacao excede o teto administrativo do concedente.';
  END IF;
  IF target_unit_id IS NOT NULL AND target_company_id IS NULL THEN RAISE EXCEPTION 'Unidade exige empresa.'; END IF;
  IF target_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=target_company_id AND status='active'
  ) THEN RAISE EXCEPTION 'Empresa fora do tenant ou inativa.'; END IF;
  IF target_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_units WHERE tenant_id=tenant_key AND id=target_unit_id AND company_id=target_company_id
  ) THEN RAISE EXCEPTION 'Unidade fora da empresa ou tenant.'; END IF;
  INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,company_id,unit_id,granted_by)
    VALUES (tenant_key,target_user_id,target_role,target_company_id,target_unit_id,actor_key) RETURNING id INTO new_id;
  snap := jsonb_build_object('userId',target_user_id,'role',target_role,'companyId',target_company_id,
    'unitId',target_unit_id,'grantedBy',actor_key);
  INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
    VALUES (tenant_key,actor_key,'admin_grant',new_id::text,'created',trim(reason_text),snap);
  RETURN new_id;
END $$;

CREATE FUNCTION tenant_authority_candidate.revoke_admin(grant_id uuid, reason_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  target tenant_authority_candidate.admin_grants%ROWTYPE;
  actor_level integer;
  target_level integer;
BEGIN
  SELECT * INTO target FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND id=grant_id AND active FOR UPDATE;
  IF NOT FOUND OR actor_key IS NULL OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Concessao ativa e justificativa obrigatorias.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ator sem conta ativa.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active
      AND (company_id IS NULL OR company_id=target.company_id)
      AND (unit_id IS NULL OR unit_id=target.unit_id) FOR SHARE;
  SELECT max(CASE role WHEN 'tenant_owner' THEN 3 WHEN 'tenant_admin' THEN 2 ELSE 1 END)
    INTO actor_level FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active
      AND (company_id IS NULL OR company_id=target.company_id)
      AND (unit_id IS NULL OR unit_id=target.unit_id);
  target_level := CASE target.role WHEN 'tenant_owner' THEN 3 WHEN 'tenant_admin' THEN 2 ELSE 1 END;
  IF actor_level IS NULL OR actor_level <= target_level OR actor_key=target.user_id THEN
    RAISE EXCEPTION 'Revogacao excede autoridade do ator ou tenta remover mesmo nivel.';
  END IF;
  UPDATE tenant_authority_candidate.admin_grants SET active=false,revoked_by=actor_key,revoked_at=clock_timestamp()
    WHERE tenant_id=tenant_key AND id=grant_id;
  INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
    VALUES (tenant_key,actor_key,'admin_grant',grant_id::text,'revoked',trim(reason_text),
      jsonb_build_object('userId',target.user_id,'role',target.role,'companyId',target.company_id,'unitId',target.unit_id));
  RETURN true;
END $$;

-- Ações permitidas fazem parte de uma allowlist de API definida pelo servidor.
CREATE FUNCTION tenant_authority_candidate.create_application(
  app_name text, fingerprint text, actions text[], target_company_id text, target_unit_id text,
  target_third_party_id text, valid_until timestamptz, per_minute integer, per_day integer, reason_text text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  new_id uuid;
  snap jsonb;
  actor_is_admin boolean;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR length(trim(coalesce(app_name,''))) NOT BETWEEN 1 AND 120
     OR length(trim(coalesce(fingerprint,''))) NOT BETWEEN 1 AND 300
     OR per_minute IS NULL OR per_day IS NULL
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000
     OR valid_until <= clock_timestamp() OR valid_until > clock_timestamp()+interval '366 days'
     OR actions IS NULL OR cardinality(actions) NOT BETWEEN 1 AND 20 OR array_position(actions,NULL) IS NOT NULL
     OR EXISTS (SELECT 1 FROM unnest(actions) AS action(value) WHERE action.value NOT IN
       ('thirdparty.documents.submit','thirdparty.status.read','documents.read','pgr.read','operations.read')) THEN
    RAISE EXCEPTION 'Escopo, acoes permitidas, validade, cotas e justificativa invalidos.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ator sem conta ativa.'; END IF;
  SELECT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active AND role IN ('tenant_owner','tenant_admin')
      AND (company_id IS NULL OR company_id=target_company_id)
      AND (unit_id IS NULL OR unit_id=target_unit_id)) INTO actor_is_admin;
  IF NOT actor_is_admin THEN RAISE EXCEPTION 'Somente administrador autorizado do escopo pode provisionar aplicacao.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil do tenant ausente ou inativo.'; END IF;
  IF (SELECT count(*) FROM tenant_authority_candidate.application_principals
      WHERE tenant_id=tenant_key AND revoked_at IS NULL AND expires_at>clock_timestamp()) >=
     (SELECT application_limit FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key) THEN
    RAISE EXCEPTION 'Limite de aplicativos ativos do tenant atingido.';
  END IF;
  IF target_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=target_company_id AND status='active'
  ) THEN RAISE EXCEPTION 'Empresa fora do tenant ou inativa.'; END IF;
  IF target_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_units WHERE tenant_id=tenant_key AND id=target_unit_id AND company_id=target_company_id
  ) THEN RAISE EXCEPTION 'Unidade fora da empresa ou tenant.'; END IF;
  -- Nao validar target_third_party_id contra cadastro inexistente no schema
  -- atual. Esse escopo fica indisponivel ate existir FK/fonte autoritativa.
  IF target_third_party_id IS NOT NULL THEN
    RAISE EXCEPTION 'Escopo por terceiro indisponivel ate existir cadastro autoritativo.';
  END IF;
  INSERT INTO tenant_authority_candidate.application_principals(tenant_id,name,credential_fingerprint,allowed_actions,
    company_id,unit_id,third_party_id,expires_at,calls_limit_per_minute,calls_limit_per_day,created_by)
    VALUES (tenant_key,trim(app_name),fingerprint,actions,target_company_id,target_unit_id,target_third_party_id,
      valid_until,per_minute,per_day,actor_key) RETURNING id INTO new_id;
  snap := jsonb_build_object('id',new_id,'name',trim(app_name),'actions',actions,'companyId',target_company_id,
    'unitId',target_unit_id,'thirdPartyId',target_third_party_id,'expiresAt',valid_until,
    'callsPerMinute',per_minute,'callsPerDay',per_day);
  INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
    VALUES (tenant_key,actor_key,'application_principal',new_id::text,'created',trim(reason_text),snap);
  RETURN new_id;
END $$;

CREATE FUNCTION tenant_authority_candidate.revoke_application(app_id uuid, reason_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  app tenant_authority_candidate.application_principals%ROWTYPE;
BEGIN
  SELECT * INTO app FROM tenant_authority_candidate.application_principals
    WHERE tenant_id=tenant_key AND id=app_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Aplicacao ativa e justificativa obrigatorias.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil do tenant ausente ou inativo.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ator sem conta ativa.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active AND role IN ('tenant_owner','tenant_admin')
      AND (company_id IS NULL OR company_id=app.company_id) AND (unit_id IS NULL OR unit_id=app.unit_id) FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active AND role IN ('tenant_owner','tenant_admin')
      AND (company_id IS NULL OR company_id=app.company_id) AND (unit_id IS NULL OR unit_id=app.unit_id)) THEN
    RAISE EXCEPTION 'Ator sem autoridade para revogar esta aplicacao.';
  END IF;
  UPDATE tenant_authority_candidate.application_principals SET revoked_at=clock_timestamp()
    WHERE tenant_id=tenant_key AND id=app_id;
  INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
    VALUES (tenant_key,actor_key,'application_principal',app_id::text,'revoked',trim(reason_text),
      jsonb_build_object('name',app.name,'actions',app.allowed_actions,'companyId',app.company_id,
        'unitId',app.unit_id,'thirdPartyId',app.third_party_id));
  RETURN true;
END $$;

-- Troca atomica do fingerprint: a credencial anterior deixa de autenticar no
-- mesmo commit. O novo segredo deve ser mostrado uma unica vez pela camada
-- que o gera; nem segredo nem fingerprint sao copiados para a auditoria.
CREATE FUNCTION tenant_authority_candidate.rotate_application_credential(
  app_id uuid, new_fingerprint text, new_expiry timestamptz, reason_text text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  app tenant_authority_candidate.application_principals%ROWTYPE;
BEGIN
  SELECT * INTO app FROM tenant_authority_candidate.application_principals
    WHERE tenant_id=tenant_key AND id=app_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND OR actor_key IS NULL OR length(trim(coalesce(new_fingerprint,''))) NOT BETWEEN 1 AND 300
     OR new_expiry<=clock_timestamp() OR new_expiry>clock_timestamp()+interval '366 days'
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Aplicacao ativa, nova credencial, validade e justificativa obrigatorias.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ator sem conta ativa.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active AND role IN ('tenant_owner','tenant_admin')
      AND (company_id IS NULL OR company_id=app.company_id)
      AND (unit_id IS NULL OR unit_id=app.unit_id) FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active AND role IN ('tenant_owner','tenant_admin')
      AND (company_id IS NULL OR company_id=app.company_id)
      AND (unit_id IS NULL OR unit_id=app.unit_id)) THEN
    RAISE EXCEPTION 'Ator sem autoridade para rotacionar esta aplicacao.';
  END IF;
  UPDATE tenant_authority_candidate.application_principals
    SET credential_fingerprint=new_fingerprint,expires_at=new_expiry
    WHERE tenant_id=tenant_key AND id=app_id;
  INSERT INTO tenant_authority_candidate.events(tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot)
    VALUES (tenant_key,actor_key,'application_principal',app_id::text,'changed',trim(reason_text),
      jsonb_build_object('name',app.name,'actions',app.allowed_actions,'companyId',app.company_id,
        'unitId',app.unit_id,'previousExpiry',app.expires_at,'expiresAt',new_expiry));
  RETURN true;
END $$;

-- Chamado pelo middleware da API por requisicao autenticada, em transacao.
-- Atualizacao atomica evita que requisicoes concorrentes ultrapassem cotas.
CREATE FUNCTION tenant_authority_candidate.authorize_application(
  fingerprint text, required_action text, request_company_id text,
  request_unit_id text, request_third_party_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  app tenant_authority_candidate.application_principals%ROWTYPE;
  minute_key timestamptz := date_trunc('minute',clock_timestamp());
  day_key date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  used_minute integer;
  used_day integer;
BEGIN
  IF tenant_key IS NULL OR fingerprint IS NULL OR required_action IS NULL THEN
    RAISE EXCEPTION 'Tenant, credencial e acao sao obrigatorios.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id=tenant_key AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant suspenso ou inexistente.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id=tenant_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil do tenant ausente ou inativo.'; END IF;
  SELECT * INTO app FROM tenant_authority_candidate.application_principals
    WHERE tenant_id=tenant_key AND credential_fingerprint=fingerprint AND revoked_at IS NULL
      AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND OR NOT (required_action=ANY(app.allowed_actions))
     OR (app.company_id IS NOT NULL AND app.company_id IS DISTINCT FROM request_company_id)
     OR (app.unit_id IS NOT NULL AND app.unit_id IS DISTINCT FROM request_unit_id)
     OR (app.third_party_id IS NOT NULL AND app.third_party_id IS DISTINCT FROM request_third_party_id) THEN
    RAISE EXCEPTION 'Aplicacao invalida, revogada, expirada ou fora do escopo.';
  END IF;
  IF app.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_companies WHERE tenant_id=tenant_key AND id=app.company_id AND status='active'
  ) THEN RAISE EXCEPTION 'Empresa do escopo inativa ou inexistente.'; END IF;
  IF app.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sst.client_units WHERE tenant_id=tenant_key AND id=app.unit_id AND company_id=app.company_id
  ) THEN RAISE EXCEPTION 'Unidade do escopo inexistente ou incompatível.'; END IF;
  INSERT INTO tenant_authority_candidate.application_usage(tenant_id,principal_id,minute_bucket,day_bucket,calls_minute,calls_day)
    VALUES (tenant_key,app.id,minute_key,day_key,1,1)
    ON CONFLICT (tenant_id,principal_id,minute_bucket,day_bucket) DO UPDATE
      SET calls_minute=tenant_authority_candidate.application_usage.calls_minute+1,
          calls_day=tenant_authority_candidate.application_usage.calls_day+1
    RETURNING calls_minute,calls_day INTO used_minute,used_day;
  IF used_minute>app.calls_limit_per_minute OR used_day>app.calls_limit_per_day THEN
    RAISE EXCEPTION 'Cota de chamadas da aplicacao excedida.';
  END IF;
  RETURN app.id;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tenant_authority_candidate FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_authority_candidate.grant_admin(text,text,text,text,text),
  tenant_authority_candidate.revoke_admin(uuid,text),
  tenant_authority_candidate.create_application(text,text,text[],text,text,text,timestamptz,integer,integer,text),
  tenant_authority_candidate.revoke_application(uuid,text),
  tenant_authority_candidate.rotate_application_credential(uuid,text,timestamptz,text),
  tenant_authority_candidate.authorize_application(text,text,text,text,text)
  TO tenant_authority_candidate_app;
-- bootstrap_tenant permanece exclusivo do provisionador confiavel do banco.
-- Provar funcoes, RLS, teto, concorrencia e cotas em Postgres descartavel antes de qualquer uso.
