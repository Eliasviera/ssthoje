-- Candidate only. Never apply to an active database before isolated proof,
-- review, and explicit cutover approval.
CREATE SCHEMA tenant_identity_candidate;
CREATE ROLE tenant_identity_candidate_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE tenant_identity_candidate_provisioner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- A global identity is separate from tenant membership. Passwords must be
-- application-generated scrypt encodings; plaintext is never stored.
CREATE TABLE tenant_identity_candidate.accounts (
  user_id text PRIMARY KEY CHECK (length(user_id) BETWEEN 1 AND 200),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  password_hash text NOT NULL CHECK (password_hash ~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (email_normalized)
);

-- Tenant profile has platform ceilings and client-selected limits. A platform
-- provisioner must supply explicit values; product/commercial defaults are
-- deliberately not invented here.
CREATE TABLE tenant_identity_candidate.tenant_profiles (
  tenant_id text PRIMARY KEY REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  operating_mode text NOT NULL CHECK (operating_mode IN ('consultancy', 'direct_client')),
  platform_user_ceiling integer NOT NULL CHECK (platform_user_ceiling > 0),
  platform_company_ceiling integer NOT NULL CHECK (platform_company_ceiling > 0),
  platform_worker_ceiling integer NOT NULL CHECK (platform_worker_ceiling > 0),
  platform_storage_bytes_ceiling bigint NOT NULL CHECK (platform_storage_bytes_ceiling > 0),
  user_limit integer NOT NULL CHECK (user_limit > 0 AND user_limit <= platform_user_ceiling),
  company_limit integer NOT NULL CHECK (company_limit > 0 AND company_limit <= platform_company_ceiling),
  worker_limit integer NOT NULL CHECK (worker_limit > 0 AND worker_limit <= platform_worker_ceiling),
  storage_bytes_limit bigint NOT NULL CHECK (storage_bytes_limit > 0 AND storage_bytes_limit <= platform_storage_bytes_ceiling),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tenant_identity_candidate.invitations (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  target_role text NOT NULL CHECK (target_role IN (
    'tenant_owner', 'cliente', 'sst_tst', 'profissional_habilitado', 'medico_coordenador'
  )),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (token_sha256),
  CHECK ((status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status <> 'accepted' AND accepted_by IS NULL AND accepted_at IS NULL))
);
CREATE UNIQUE INDEX tenant_identity_one_pending_invite_per_email
  ON tenant_identity_candidate.invitations (tenant_id, email_normalized)
  WHERE status = 'pending';

CREATE TABLE tenant_identity_candidate.events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('profile', 'invitation', 'membership')),
  subject_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('tenant_provisioned', 'invited', 'accepted', 'revoked', 'expired', 'limits_changed', 'membership_suspended')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id)
);

CREATE FUNCTION tenant_identity_candidate.bump_profile_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END
$$;
CREATE TRIGGER tenant_identity_profile_version
  BEFORE UPDATE ON tenant_identity_candidate.tenant_profiles
  FOR EACH ROW EXECUTE FUNCTION tenant_identity_candidate.bump_profile_version();

CREATE FUNCTION tenant_identity_candidate.reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'identity events are append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER tenant_identity_events_append_only
  BEFORE UPDATE OR DELETE ON tenant_identity_candidate.events
  FOR EACH ROW EXECUTE FUNCTION tenant_identity_candidate.reject_event_mutation();

ALTER TABLE tenant_identity_candidate.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.tenant_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON tenant_identity_candidate.tenant_profiles
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));
CREATE POLICY tenant_scope ON tenant_identity_candidate.invitations
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));
CREATE POLICY tenant_scope ON tenant_identity_candidate.events
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));
ALTER TABLE tenant_identity_candidate.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_identity_candidate.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY account_self ON tenant_identity_candidate.accounts
  USING (user_id = current_setting('sst.user_id', true))
  WITH CHECK (user_id = current_setting('sst.user_id', true));

REVOKE ALL ON ALL TABLES IN SCHEMA tenant_identity_candidate FROM PUBLIC, tenant_identity_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tenant_identity_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA tenant_identity_candidate TO tenant_identity_candidate_app;
GRANT SELECT ON tenant_identity_candidate.tenant_profiles TO tenant_identity_candidate_app;

-- Trusted platform bootstrap. The invite token is generated by the app and
-- only its SHA-256 digest is persisted. The direct-client owner is activated
-- by redeeming that invitation; no user or password is fabricated here.
CREATE FUNCTION tenant_identity_candidate.provision_direct_client(
  target_tenant_id text,
  tenant_name text,
  owner_email text,
  owner_display_name text,
  invite_token_sha256 text,
  invite_expires_at timestamptz,
  user_ceiling integer,
  company_ceiling integer,
  worker_ceiling integer,
  storage_ceiling_bytes bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  invite_id uuid;
BEGIN
  IF target_tenant_id IS NULL OR target_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,99}$'
     OR length(trim(coalesce(tenant_name,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(owner_email,''))) NOT BETWEEN 3 AND 254
     OR owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(trim(coalesce(owner_display_name,''))) NOT BETWEEN 1 AND 200
     OR invite_token_sha256 !~ '^[0-9a-f]{64}$'
     OR invite_expires_at <= clock_timestamp()
     OR invite_expires_at > clock_timestamp() + interval '30 days'
     OR user_ceiling IS NULL OR user_ceiling < 1
     OR company_ceiling IS NULL OR company_ceiling < 1
     OR worker_ceiling IS NULL OR worker_ceiling < 1
     OR storage_ceiling_bytes IS NULL OR storage_ceiling_bytes < 1 THEN
    RAISE EXCEPTION 'Tenant, titular, convite e tetos explícitos válidos são obrigatórios.';
  END IF;
  INSERT INTO sst.tenants(id, name, status) VALUES (target_tenant_id, trim(tenant_name), 'active');
  INSERT INTO tenant_identity_candidate.tenant_profiles(
    tenant_id, operating_mode, platform_user_ceiling, platform_company_ceiling,
    platform_worker_ceiling, platform_storage_bytes_ceiling,
    user_limit, company_limit, worker_limit, storage_bytes_limit
  ) VALUES (
    target_tenant_id, 'direct_client', user_ceiling, company_ceiling,
    worker_ceiling, storage_ceiling_bytes,
    user_ceiling, company_ceiling, worker_ceiling, storage_ceiling_bytes
  );
  INSERT INTO tenant_authority_candidate.tenant_profiles(tenant_id,operating_mode)
    VALUES (target_tenant_id,'direct_client');
  INSERT INTO tenant_identity_candidate.invitations(
    tenant_id, email, target_role, token_sha256, invited_by, expires_at
  ) VALUES (
    target_tenant_id, lower(trim(owner_email)), 'tenant_owner',
    invite_token_sha256, 'trusted_onboarding', invite_expires_at
  ) RETURNING id INTO invite_id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id, actor_user_id, subject_type, subject_id, action, reason, snapshot
  ) VALUES (
    target_tenant_id, 'trusted_onboarding', 'profile', target_tenant_id, 'tenant_provisioned',
    'Titularidade do tenant validada pelo provisionador confiável.',
    jsonb_build_object('operatingMode','direct_client','ownerEmail',lower(trim(owner_email)),
      'userCeiling',user_ceiling,'companyCeiling',company_ceiling,
      'workerCeiling',worker_ceiling,'storageBytesCeiling',storage_ceiling_bytes)
  );
  RETURN invite_id;
END
$$;
REVOKE ALL ON FUNCTION tenant_identity_candidate.provision_direct_client(text,text,text,text,text,timestamptz,integer,integer,integer,bigint)
  FROM PUBLIC, tenant_identity_candidate_app;
GRANT USAGE ON SCHEMA tenant_identity_candidate TO tenant_identity_candidate_provisioner;
GRANT EXECUTE ON FUNCTION tenant_identity_candidate.provision_direct_client(text,text,text,text,text,timestamptz,integer,integer,integer,bigint)
  TO tenant_identity_candidate_provisioner;

-- The activation transaction locks the invitation and profile, creates one
-- identity and one membership, and consumes the invitation exactly once.
CREATE FUNCTION tenant_identity_candidate.redeem_invitation(
  invite_token_sha256 text,
  submitted_email text,
  submitted_display_name text,
  submitted_password_hash text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  invitation tenant_identity_candidate.invitations%ROWTYPE;
  profile tenant_identity_candidate.tenant_profiles%ROWTYPE;
  invitation_tenant_id text;
  new_user_id text;
  membership_role text;
BEGIN
  IF invite_token_sha256 IS NULL OR invite_token_sha256 !~ '^[0-9a-f]{64}$'
     OR length(trim(coalesce(submitted_email,''))) NOT BETWEEN 3 AND 254
     OR submitted_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(trim(coalesce(submitted_display_name,''))) NOT BETWEEN 1 AND 200
     OR submitted_password_hash !~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN
    RAISE EXCEPTION 'Convite e dados de ativação inválidos.';
  END IF;
  SELECT tenant_id INTO invitation_tenant_id FROM tenant_identity_candidate.invitations
    WHERE token_sha256 = invite_token_sha256;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite expirado, já utilizado ou incompatível com o e-mail.';
  END IF;
  SELECT * INTO profile FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = invitation_tenant_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  SELECT * INTO invitation FROM tenant_identity_candidate.invitations
    WHERE tenant_id = invitation_tenant_id AND token_sha256 = invite_token_sha256
    FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' OR invitation.expires_at <= clock_timestamp()
     OR invitation.email_normalized <> lower(trim(submitted_email)) THEN
    RAISE EXCEPTION 'Convite expirado, já utilizado ou incompatível com o e-mail.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_identity_candidate.accounts
      WHERE email_normalized = lower(trim(submitted_email))) THEN
    RAISE EXCEPTION 'Esta identidade já existe; entre na conta e aceite o convite autenticado.';
  END IF;
  IF (SELECT count(*) FROM sst.tenant_memberships
      WHERE tenant_id = invitation.tenant_id AND status = 'active')
      + (SELECT count(*) FROM tenant_identity_candidate.invitations
         WHERE tenant_id = invitation.tenant_id AND status = 'pending'
           AND expires_at > clock_timestamp()) > profile.user_limit THEN
    RAISE EXCEPTION 'Limite de usuários ativos e convites pendentes atingido.';
  END IF;
  new_user_id := 'user-' || gen_random_uuid()::text;
  membership_role := CASE WHEN invitation.target_role = 'tenant_owner' THEN 'cliente' ELSE invitation.target_role END;
  INSERT INTO tenant_identity_candidate.accounts(user_id,email,display_name,password_hash)
    VALUES (new_user_id,lower(trim(submitted_email)),trim(submitted_display_name),submitted_password_hash);
  INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name)
    VALUES (invitation.tenant_id,new_user_id,membership_role,'active',trim(submitted_display_name));
  IF invitation.target_role = 'tenant_owner' THEN
    INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
      VALUES (invitation.tenant_id,new_user_id,'tenant_owner','trusted_onboarding'),
             (invitation.tenant_id,new_user_id,'tenant_admin','trusted_onboarding');
  END IF;
  UPDATE tenant_identity_candidate.invitations
    SET status = 'accepted', accepted_by = new_user_id, accepted_at = clock_timestamp()
    WHERE tenant_id = invitation.tenant_id AND id = invitation.id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id, actor_user_id, subject_type, subject_id, action, reason, snapshot
  ) VALUES (
    invitation.tenant_id,new_user_id,'invitation',invitation.id::text,'accepted',
    'Convite de ativação consumido uma única vez.',
    jsonb_build_object('email',invitation.email_normalized,'role',invitation.target_role,
      'membershipRole',membership_role,'invitationId',invitation.id)
  );
  RETURN new_user_id;
END
$$;

CREATE FUNCTION tenant_identity_candidate.accept_invitation(invite_token_sha256 text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor_key text := current_setting('sst.user_id', true);
  invitation_tenant_id text;
  invitation tenant_identity_candidate.invitations%ROWTYPE;
  profile tenant_identity_candidate.tenant_profiles%ROWTYPE;
  account_email text;
  account_status text;
  membership_role text;
BEGIN
  IF actor_key IS NULL OR length(actor_key) NOT BETWEEN 1 AND 200
     OR invite_token_sha256 IS NULL OR invite_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Autenticação e convite válidos são obrigatórios.';
  END IF;
  SELECT tenant_id INTO invitation_tenant_id FROM tenant_identity_candidate.invitations
    WHERE token_sha256 = invite_token_sha256;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite expirado, já utilizado ou incompatível com a conta.'; END IF;
  SELECT * INTO profile FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = invitation_tenant_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  SELECT * INTO invitation FROM tenant_identity_candidate.invitations
    WHERE tenant_id = invitation_tenant_id AND token_sha256 = invite_token_sha256
    FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' OR invitation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Convite expirado, já utilizado ou incompatível com a conta.';
  END IF;
  SELECT email_normalized, status INTO account_email, account_status
    FROM tenant_identity_candidate.accounts WHERE user_id = actor_key FOR SHARE;
  IF NOT FOUND OR account_status <> 'active'
     OR account_email <> invitation.email_normalized THEN
    RAISE EXCEPTION 'A conta autenticada não corresponde ao convite ou está suspensa.';
  END IF;
  IF EXISTS (SELECT 1 FROM sst.tenant_memberships
      WHERE tenant_id = invitation_tenant_id AND user_id = actor_key) THEN
    RAISE EXCEPTION 'Esta conta já possui membership neste tenant; convite não reativa acesso suspenso.';
  END IF;
  IF (SELECT count(*) FROM sst.tenant_memberships
      WHERE tenant_id = invitation_tenant_id AND status = 'active')
      + (SELECT count(*) FROM tenant_identity_candidate.invitations
         WHERE tenant_id = invitation_tenant_id AND status = 'pending'
           AND expires_at > clock_timestamp()) > profile.user_limit THEN
    RAISE EXCEPTION 'Limite de usuários ativos e convites pendentes atingido.';
  END IF;
  membership_role := CASE WHEN invitation.target_role = 'tenant_owner' THEN 'cliente' ELSE invitation.target_role END;
  INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name)
    SELECT invitation_tenant_id, actor_key, membership_role, 'active', display_name
      FROM tenant_identity_candidate.accounts WHERE user_id = actor_key;
  IF invitation.target_role = 'tenant_owner' THEN
    INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
      VALUES (invitation_tenant_id,actor_key,'tenant_owner','trusted_onboarding'),
             (invitation_tenant_id,actor_key,'tenant_admin','trusted_onboarding');
  END IF;
  UPDATE tenant_identity_candidate.invitations
    SET status = 'accepted', accepted_by = actor_key, accepted_at = clock_timestamp()
    WHERE tenant_id = invitation_tenant_id AND id = invitation.id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id, actor_user_id, subject_type, subject_id, action, reason, snapshot
  ) VALUES (
    invitation_tenant_id,actor_key,'invitation',invitation.id::text,'accepted',
    'Convite aceito por identidade SST Hoje previamente autenticada.',
    jsonb_build_object('email',invitation.email_normalized,'role',invitation.target_role,
      'membershipRole',membership_role,'invitationId',invitation.id)
  );
  RETURN actor_key;
END
$$;

CREATE FUNCTION tenant_identity_candidate.invite_member(
  submitted_email text,
  submitted_role text,
  invite_token_sha256 text,
  invite_expires_at timestamptz,
  reason_text text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id', true);
  actor_key text := current_setting('sst.user_id', true);
  profile tenant_identity_candidate.tenant_profiles%ROWTYPE;
  invitation_id uuid;
  existing_account_status text;
  existing_user_id text;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(submitted_email,''))) NOT BETWEEN 3 AND 254
     OR submitted_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR submitted_role NOT IN ('cliente','sst_tst','profissional_habilitado','medico_coordenador')
     OR invite_token_sha256 !~ '^[0-9a-f]{64}$'
     OR invite_expires_at <= clock_timestamp()
     OR invite_expires_at > clock_timestamp() + interval '30 days'
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessão, papel, validade do convite e justificativa válidos são obrigatórios.';
  END IF;
  SELECT * INTO profile FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrador não autenticado no tenant.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id = tenant_key AND user_id = actor_key AND active
      AND role IN ('tenant_owner','tenant_admin') FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')) THEN
    RAISE EXCEPTION 'Somente o administrador do cliente pode convidar pessoas.';
  END IF;
  WITH expired AS (
    UPDATE tenant_identity_candidate.invitations
      SET status = 'expired'
      WHERE tenant_id = tenant_key AND status = 'pending' AND expires_at <= clock_timestamp()
      RETURNING id,email_normalized,target_role,expires_at
  )
  INSERT INTO tenant_identity_candidate.events(
    tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot
  )
  SELECT tenant_key,actor_key,'invitation',id::text,'expired','Convite expirado antes de nova emissão.',
    jsonb_build_object('email',email_normalized,'role',target_role,'expiredAt',expires_at)
    FROM expired;
  SELECT user_id, status INTO existing_user_id, existing_account_status
    FROM tenant_identity_candidate.accounts
    WHERE email_normalized = lower(trim(submitted_email));
  IF FOUND AND existing_account_status <> 'active' THEN
    RAISE EXCEPTION 'Não é possível convidar uma identidade global suspensa.';
  END IF;
  IF existing_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM sst.tenant_memberships
      WHERE tenant_id = tenant_key AND user_id = existing_user_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já possui membership neste tenant; convite não reativa acesso suspenso.';
  END IF;
  IF (SELECT count(*) FROM sst.tenant_memberships WHERE tenant_id = tenant_key AND status = 'active')
     + (SELECT count(*) FROM tenant_identity_candidate.invitations
        WHERE tenant_id = tenant_key AND status = 'pending' AND expires_at > clock_timestamp())
     >= profile.user_limit THEN
    RAISE EXCEPTION 'Limite de usuários ativos e convites pendentes atingido.';
  END IF;
  INSERT INTO tenant_identity_candidate.invitations(
    tenant_id,email,target_role,token_sha256,invited_by,expires_at
  ) VALUES (
    tenant_key,lower(trim(submitted_email)),submitted_role,invite_token_sha256,actor_key,invite_expires_at
  ) RETURNING id INTO invitation_id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot
  ) VALUES (
    tenant_key,actor_key,'invitation',invitation_id::text,'invited',trim(reason_text),
    jsonb_build_object('email',lower(trim(submitted_email)),'role',submitted_role,'expiresAt',invite_expires_at)
  );
  RETURN invitation_id;
END
$$;

GRANT EXECUTE ON FUNCTION tenant_identity_candidate.redeem_invitation(text,text,text,text),
  tenant_identity_candidate.accept_invitation(text),
  tenant_identity_candidate.invite_member(text,text,text,timestamptz,text)
  TO tenant_identity_candidate_app;

-- Login lookup is global by normalized address but returns no data to callers
-- that are not executing as the dedicated application role.
CREATE FUNCTION tenant_identity_candidate.lookup_login_account(submitted_email text)
RETURNS TABLE(user_id text, email text, display_name text, password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF length(trim(coalesce(submitted_email,''))) NOT BETWEEN 3 AND 254 THEN
    RAISE EXCEPTION 'Operação de autenticação inválida.';
  END IF;
  RETURN QUERY
    SELECT account.user_id, account.email, account.display_name, account.password_hash
      FROM tenant_identity_candidate.accounts AS account
     WHERE account.email_normalized = lower(trim(submitted_email))
       AND account.status = 'active';
END
$$;
CREATE FUNCTION tenant_identity_candidate.revoke_invitation(invitation_id uuid, reason_text text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id', true);
  actor_key text := current_setting('sst.user_id', true);
  invitation tenant_identity_candidate.invitations%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessão e justificativa válidas são obrigatórias.';
  END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrador não autenticado no tenant.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id = tenant_key AND user_id = actor_key AND active
      AND role IN ('tenant_owner','tenant_admin') FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')) THEN
    RAISE EXCEPTION 'Somente o administrador do cliente pode revogar convites.';
  END IF;
  SELECT * INTO invitation FROM tenant_identity_candidate.invitations
    WHERE tenant_id = tenant_key AND id = invitation_id AND status = 'pending'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite pendente não encontrado neste tenant.'; END IF;
  UPDATE tenant_identity_candidate.invitations SET status = 'revoked'
    WHERE tenant_id = tenant_key AND id = invitation_id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot
  ) VALUES (
    tenant_key,actor_key,'invitation',invitation_id::text,'revoked',trim(reason_text),
    jsonb_build_object('email',invitation.email_normalized,'role',invitation.target_role)
  );
  RETURN true;
END
$$;

CREATE FUNCTION tenant_identity_candidate.suspend_member(target_user_id text, reason_text text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id', true);
  actor_key text := current_setting('sst.user_id', true);
  target_role text;
  actor_is_owner boolean;
  actor_is_admin boolean;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR target_user_id IS NULL
     OR actor_key = target_user_id
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessão, pessoa diferente do administrador e justificativa são obrigatórias.';
  END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant inativo ou sem configuração válida.'; END IF;
  PERFORM id FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id = tenant_key AND user_id = actor_key AND active
      AND role IN ('tenant_owner','tenant_admin') FOR SHARE;
  SELECT EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id = tenant_key AND user_id = actor_key AND active AND role = 'tenant_owner'),
    EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
    WHERE tenant_id = tenant_key AND user_id = actor_key AND active AND role = 'tenant_admin')
    INTO actor_is_owner, actor_is_admin;
  IF NOT actor_is_owner AND NOT actor_is_admin THEN
    RAISE EXCEPTION 'Somente o administrador do cliente pode suspender usuários.';
  END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrador não autenticado no tenant.'; END IF;
  SELECT role INTO target_role FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = target_user_id AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário ativo não encontrado neste tenant.'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = target_user_id AND active
        AND role = 'tenant_owner') AND NOT actor_is_owner THEN
    RAISE EXCEPTION 'Administrador sem autoridade para suspender o titular do tenant.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = target_user_id AND active
        AND role IN ('tenant_owner','tenant_admin')) AND NOT actor_is_owner THEN
    RAISE EXCEPTION 'Somente o titular pode suspender outro administrador.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = target_user_id AND active
        AND role = 'tenant_owner')
     AND (SELECT count(*) FROM tenant_authority_candidate.admin_grants
       WHERE tenant_id = tenant_key AND active AND role = 'tenant_owner') <= 1 THEN
    RAISE EXCEPTION 'Não é possível suspender o último titular ativo.';
  END IF;
  UPDATE sst.tenant_memberships SET status = 'suspended'
    WHERE tenant_id = tenant_key AND user_id = target_user_id;
  INSERT INTO tenant_identity_candidate.events(
    tenant_id,actor_user_id,subject_type,subject_id,action,reason,snapshot
  ) VALUES (
    tenant_key,actor_key,'membership',target_user_id,'membership_suspended',trim(reason_text),
    jsonb_build_object('userId',target_user_id,'membershipRole',target_role)
  );
  RETURN true;
END
$$;

GRANT EXECUTE ON FUNCTION tenant_identity_candidate.lookup_login_account(text),
  tenant_identity_candidate.revoke_invitation(uuid,text),
  tenant_identity_candidate.suspend_member(text,text)
  TO tenant_identity_candidate_app;
REVOKE ALL ON FUNCTION tenant_identity_candidate.redeem_invitation(text,text,text,text),
  tenant_identity_candidate.invite_member(text,text,text,timestamptz,text),
  tenant_identity_candidate.lookup_login_account(text),
  tenant_identity_candidate.revoke_invitation(uuid,text),
  tenant_identity_candidate.suspend_member(text,text)
  FROM PUBLIC;
