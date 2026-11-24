-- CANDIDATE ONLY. Never apply to an active database.
-- Dependencies: tenant-self-service-identity-candidate.sql,
-- tenant-authority-candidate.sql and tenant-worker-quota-candidate.sql.
-- Does not connect to application login/runtime. A matching-email account can request
-- a link, but access remains pending until an authorized human verifies the
-- worker identity using a separately confirmed reference.

CREATE SCHEMA tenant_worker_identity_candidate;
CREATE ROLE tenant_worker_identity_candidate_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE TABLE tenant_worker_identity_candidate.invitations (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 254),
  email_normalized text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by text NOT NULL,
  accepted_by text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (token_sha256),
  UNIQUE (tenant_id,id,worker_id,accepted_by),
  FOREIGN KEY (tenant_id,worker_id)
    REFERENCES tenant_worker_candidate.workers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,invited_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (accepted_by)
    REFERENCES tenant_identity_candidate.accounts(user_id) ON DELETE RESTRICT,
  CHECK ((status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status <> 'accepted' AND accepted_by IS NULL AND accepted_at IS NULL))
);
CREATE UNIQUE INDEX tenant_worker_one_pending_identity_invite
  ON tenant_worker_identity_candidate.invitations(tenant_id,worker_id)
  WHERE status = 'pending';

CREATE TABLE tenant_worker_identity_candidate.links (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  user_id text NOT NULL REFERENCES tenant_identity_candidate.accounts(user_id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','active','rejected','revoked')),
  reviewed_by text,
  reviewed_at timestamptz,
  verification_reference text CHECK (
    verification_reference IS NULL OR length(trim(verification_reference)) BETWEEN 3 AND 200
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,invitation_id),
  FOREIGN KEY (tenant_id,worker_id)
    REFERENCES tenant_worker_candidate.workers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,invitation_id,worker_id,user_id)
    REFERENCES tenant_worker_identity_candidate.invitations(tenant_id,id,worker_id,accepted_by) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,reviewed_by)
    REFERENCES sst.tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL
          AND verification_reference IS NULL)
      OR (status = 'active' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
          AND verification_reference IS NOT NULL)
      OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
      OR status = 'revoked'
  )
);
CREATE UNIQUE INDEX tenant_worker_one_live_identity_link
  ON tenant_worker_identity_candidate.links(tenant_id,worker_id)
  WHERE status IN ('pending_review','active');
CREATE UNIQUE INDEX tenant_user_one_live_worker_link
  ON tenant_worker_identity_candidate.links(tenant_id,user_id)
  WHERE status IN ('pending_review','active');
CREATE INDEX tenant_worker_identity_links_user_status
  ON tenant_worker_identity_candidate.links(tenant_id,user_id,status);

CREATE TABLE tenant_worker_identity_candidate.events (
  tenant_id text NOT NULL REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  actor_user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('invited','invitation_expired','invitation_revoked','accepted_pending_review','approved','rejected','revoked')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  verification_reference text CHECK (
    verification_reference IS NULL OR length(trim(verification_reference)) BETWEEN 3 AND 200
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,worker_id)
    REFERENCES tenant_worker_candidate.workers(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX tenant_worker_identity_events_order
  ON tenant_worker_identity_candidate.events(tenant_id,worker_id,occurred_at,id);

CREATE FUNCTION tenant_worker_identity_candidate.bump_link_timestamp() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
CREATE TRIGGER worker_identity_link_timestamp
  BEFORE UPDATE ON tenant_worker_identity_candidate.links
  FOR EACH ROW EXECUTE FUNCTION tenant_worker_identity_candidate.bump_link_timestamp();

CREATE FUNCTION tenant_worker_identity_candidate.reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'worker identity events are append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER worker_identity_events_append_only
  BEFORE UPDATE OR DELETE ON tenant_worker_identity_candidate.events
  FOR EACH ROW EXECUTE FUNCTION tenant_worker_identity_candidate.reject_event_mutation();

ALTER TABLE tenant_worker_identity_candidate.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_identity_candidate.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_identity_candidate.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_identity_candidate.links FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_identity_candidate.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_worker_identity_candidate.events FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_identity_invites_current_tenant ON tenant_worker_identity_candidate.invitations
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));
CREATE POLICY worker_identity_links_current_tenant ON tenant_worker_identity_candidate.links
  USING (tenant_id = current_setting('sst.tenant_id',true)
      OR user_id = current_setting('sst.user_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));
CREATE POLICY worker_identity_events_current_tenant ON tenant_worker_identity_candidate.events
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));
REVOKE ALL ON ALL TABLES IN SCHEMA tenant_worker_identity_candidate FROM PUBLIC,tenant_worker_identity_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tenant_worker_identity_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA tenant_worker_identity_candidate TO tenant_worker_identity_candidate_app;

CREATE FUNCTION tenant_worker_identity_candidate.create_invitation(
  worker_key text,
  target_email text,
  token_digest text,
  invitation_expires_at timestamptz,
  reason_text text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  invite_id uuid := gen_random_uuid();
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(worker_key,''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(target_email,''))) NOT BETWEEN 3 AND 254
     OR target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR token_digest IS NULL OR token_digest !~ '^[0-9a-f]{64}$'
     OR invitation_expires_at IS NULL OR invitation_expires_at <= clock_timestamp()
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Dados de convite inválidos.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id = tenant_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ativo não encontrado.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant sem configuração de autoridade ativa.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')
  ) THEN RAISE EXCEPTION 'Somente dono/admin ativo pode convidar para vínculo de trabalhador.'; END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant sem configuração de identidade ativa.'; END IF;
  WITH expired AS (
    UPDATE tenant_worker_identity_candidate.invitations
      SET status = 'expired'
      WHERE tenant_id = tenant_key AND worker_id = worker_key
        AND status = 'pending' AND expires_at <= clock_timestamp()
      RETURNING id,worker_id
  )
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  )
  SELECT tenant_key,expired.worker_id,actor_key,'invitation_expired',
    'Convite vencido encerrado antes de criar uma nova tentativa.',
    jsonb_build_object('invitationId',expired.id,'status','expired')
  FROM expired;
  PERFORM 1 FROM tenant_worker_candidate.workers
    WHERE tenant_id = tenant_key AND id = worker_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabalhador ativo não encontrado neste tenant.'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_worker_identity_candidate.links
      WHERE tenant_id = tenant_key AND worker_id = worker_key AND status IN ('pending_review','active')) THEN
    RAISE EXCEPTION 'Trabalhador já tem vínculo de portal pendente ou ativo.';
  END IF;
  INSERT INTO tenant_worker_identity_candidate.invitations(
    tenant_id,id,worker_id,email,token_sha256,invited_by,expires_at
  ) VALUES (tenant_key,invite_id,worker_key,lower(trim(target_email)),token_digest,actor_key,invitation_expires_at);
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  ) VALUES (tenant_key,worker_key,actor_key,'invited',trim(reason_text),
    jsonb_build_object('invitationId',invite_id,'status','pending'));
  RETURN invite_id;
END
$$;

CREATE FUNCTION tenant_worker_identity_candidate.revoke_invitation(invitation_key uuid, reason_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  invitation tenant_worker_identity_candidate.invitations%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR invitation_key IS NULL
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessão, convite e justificativa são obrigatórios.';
  END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')
  ) THEN RAISE EXCEPTION 'Somente dono/admin ativo pode cancelar convite.'; END IF;
  SELECT * INTO invitation FROM tenant_worker_identity_candidate.invitations
    WHERE tenant_id = tenant_key AND id = invitation_key AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite pendente não encontrado neste tenant.'; END IF;
  UPDATE tenant_worker_identity_candidate.invitations SET status = 'revoked'
    WHERE tenant_id = tenant_key AND id = invitation_key;
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  ) VALUES (tenant_key,invitation.worker_id,actor_key,'invitation_revoked',trim(reason_text),
    jsonb_build_object('invitationId',invitation.id,'status','revoked'));
  RETURN true;
END
$$;
CREATE FUNCTION tenant_worker_identity_candidate.register_worker_from_invitation(
  token_digest text,
  submitted_email text,
  submitted_display_name text,
  submitted_password_hash text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text;
  account_key text := 'worker-' || gen_random_uuid()::text;
  invitation tenant_worker_identity_candidate.invitations%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR token_digest IS NULL OR token_digest !~ '^[0-9a-f]{64}$'
     OR length(trim(coalesce(submitted_email,''))) NOT BETWEEN 3 AND 254
     OR submitted_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(trim(coalesce(submitted_display_name,''))) NOT BETWEEN 1 AND 200
     OR submitted_password_hash IS NULL
     OR submitted_password_hash !~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN
    RAISE EXCEPTION 'Dados do cadastro por convite inválidos.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id = tenant_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ativo é obrigatório para cadastro.'; END IF;
  PERFORM 1 FROM tenant_identity_candidate.tenant_profiles WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant sem identidade ativa para cadastro.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant sem autoridade ativa para cadastro.'; END IF;
  SELECT * INTO invitation FROM tenant_worker_identity_candidate.invitations
    WHERE tenant_id = tenant_key AND token_sha256 = token_digest FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' OR invitation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Convite indisponível ou expirado.';
  END IF;
  IF lower(trim(submitted_email)) <> invitation.email_normalized THEN
    RAISE EXCEPTION 'Conta não corresponde ao e-mail convidado.';
  END IF;
  PERFORM 1 FROM tenant_worker_candidate.workers
    WHERE tenant_id = tenant_key AND id = invitation.worker_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabalhador ativo não encontrado neste tenant.'; END IF;
  PERFORM set_config('sst.user_id',account_key,true);
  BEGIN
    INSERT INTO tenant_identity_candidate.accounts(user_id,email,display_name,password_hash)
      VALUES (account_key,lower(trim(submitted_email)),trim(submitted_display_name),submitted_password_hash);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Não foi possível criar a conta; use o acesso existente ou contate o administrador.'
      USING ERRCODE = '23505';
  END;
  actor_key := account_key;
  UPDATE tenant_worker_identity_candidate.invitations
    SET status = 'accepted',accepted_by = account_key,accepted_at = clock_timestamp()
    WHERE tenant_id = tenant_key AND id = invitation.id;
  INSERT INTO tenant_worker_identity_candidate.links(
    tenant_id,worker_id,user_id,invitation_id,status,reviewed_by,reviewed_at,verification_reference
  ) VALUES (tenant_key,invitation.worker_id,account_key,invitation.id,'pending_review',NULL,NULL,NULL);
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  ) VALUES (tenant_key,invitation.worker_id,actor_key,'accepted_pending_review',
    'Nova conta criada pelo convite; identidade aguarda verificação humana independente.',
    jsonb_build_object('invitationId',invitation.id,'userId',account_key,'status','pending_review','accountCreated',true));
  RETURN account_key;
END
$$;
CREATE FUNCTION tenant_worker_identity_candidate.accept_invitation(token_digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text;
  actor_key text := current_setting('sst.user_id',true);
  invitation tenant_worker_identity_candidate.invitations%ROWTYPE;
  account tenant_identity_candidate.accounts%ROWTYPE;
BEGIN
  tenant_key := current_setting('sst.tenant_id',true);
  IF tenant_key IS NULL OR actor_key IS NULL OR token_digest IS NULL OR token_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Sessão/tenant/convite inválido.';
  END IF;
  SELECT * INTO invitation FROM tenant_worker_identity_candidate.invitations
    WHERE tenant_id = tenant_key AND token_sha256 = token_digest FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' OR invitation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Convite indisponível ou expirado.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id = tenant_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ativo é obrigatório para aceitar convite.'; END IF;
  tenant_key := invitation.tenant_id;
  SELECT * INTO account FROM tenant_identity_candidate.accounts
    WHERE user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND OR lower(trim(account.email)) <> invitation.email_normalized THEN
    RAISE EXCEPTION 'Conta ativa não corresponde ao e-mail convidado.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_worker_identity_candidate.links
      WHERE tenant_id = tenant_key AND user_id = actor_key AND status IN ('pending_review','active')) THEN
    RAISE EXCEPTION 'Conta já possui vínculo pendente ou ativo neste tenant.';
  END IF;
  UPDATE tenant_worker_identity_candidate.invitations
    SET status = 'accepted',accepted_by = actor_key,accepted_at = clock_timestamp()
    WHERE tenant_id = tenant_key AND id = invitation.id;
  INSERT INTO tenant_worker_identity_candidate.links(
    tenant_id,worker_id,user_id,invitation_id,status,reviewed_by,reviewed_at,verification_reference
  ) VALUES (tenant_key,invitation.worker_id,actor_key,invitation.id,'pending_review',NULL,NULL,NULL);
  -- Acceptance proves only possession of an invitation token and a matching
  -- account email. It does not verify the worker's legal identity.
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  ) VALUES (tenant_key,invitation.worker_id,actor_key,'accepted_pending_review',
    'Conta aceitou convite; vínculo aguarda validação independente.',
    jsonb_build_object('invitationId',invitation.id,'userId',actor_key,'status','pending_review'));
  RETURN invitation.id;
END
$$;

CREATE FUNCTION tenant_worker_identity_candidate.review_link(
  worker_key text,
  approve boolean,
  verification_ref text,
  reason_text text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  link tenant_worker_identity_candidate.links%ROWTYPE;
  new_status text := CASE WHEN approve THEN 'active' ELSE 'rejected' END;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL
     OR length(trim(coalesce(worker_key,''))) NOT BETWEEN 1 AND 200
     OR approve IS NULL
     OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000
     OR (approve AND length(trim(coalesce(verification_ref,''))) NOT BETWEEN 3 AND 200) THEN
    RAISE EXCEPTION 'Revisão/justificativa/referência inválida.';
  END IF;
  PERFORM 1 FROM sst.tenants WHERE id = tenant_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ativo é obrigatório para revisar vínculo.'; END IF;
  PERFORM 1 FROM tenant_authority_candidate.tenant_profiles
    WHERE tenant_id = tenant_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant sem configuração de autoridade ativa.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')
  ) THEN RAISE EXCEPTION 'Somente dono/admin ativo pode revisar o vínculo.'; END IF;
  SELECT * INTO link FROM tenant_worker_identity_candidate.links
    WHERE tenant_id = tenant_key AND worker_id = worker_key AND status = 'pending_review' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo pendente de revisão não encontrado.'; END IF;
  IF link.user_id = actor_key THEN RAISE EXCEPTION 'O próprio titular do vínculo não pode revisá-lo.'; END IF;
  UPDATE tenant_worker_identity_candidate.links SET status = new_status,
    reviewed_by = actor_key,reviewed_at = clock_timestamp(),
    verification_reference = CASE WHEN approve THEN trim(verification_ref) ELSE NULL END
    WHERE tenant_id = tenant_key AND worker_id = worker_key;
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,verification_reference,snapshot
  ) VALUES (tenant_key,worker_key,actor_key,CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
    trim(reason_text),CASE WHEN approve THEN trim(verification_ref) ELSE NULL END,
    jsonb_build_object('userId',link.user_id,'status',new_status));
  RETURN true;
END
$$;

CREATE FUNCTION tenant_worker_identity_candidate.revoke_link(worker_key text, reason_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  link tenant_worker_identity_candidate.links%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR length(trim(coalesce(reason_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Sessão e motivo da revogação são obrigatórios.';
  END IF;
  PERFORM 1 FROM sst.tenant_memberships
    WHERE tenant_id = tenant_key AND user_id = actor_key AND status = 'active' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_authority_candidate.admin_grants
      WHERE tenant_id = tenant_key AND user_id = actor_key AND active
        AND role IN ('tenant_owner','tenant_admin')
  ) THEN RAISE EXCEPTION 'Somente dono/admin ativo pode revogar o vínculo.'; END IF;
  SELECT * INTO link FROM tenant_worker_identity_candidate.links
    WHERE tenant_id = tenant_key AND worker_id = worker_key AND status IN ('pending_review','active') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo ativo/pendente não encontrado.'; END IF;
  UPDATE tenant_worker_identity_candidate.links SET status = 'revoked'
    WHERE tenant_id = tenant_key AND worker_id = worker_key;
  INSERT INTO tenant_worker_identity_candidate.events(
    tenant_id,worker_id,actor_user_id,action,reason,snapshot
  ) VALUES (tenant_key,worker_key,actor_key,'revoked',trim(reason_text),
    jsonb_build_object('userId',link.user_id,'previousStatus',link.status,'status','revoked'));
  RETURN true;
END
$$;

CREATE FUNCTION tenant_worker_identity_candidate.read_own_worker()
RETURNS TABLE(worker_id text,display_name text,job_title text,company_id text,unit_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL THEN RAISE EXCEPTION 'Sessão autenticada é obrigatória.'; END IF;
  PERFORM 1 FROM sst.tenants WHERE id = tenant_key AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant ativo é obrigatório para consultar passaporte.'; END IF;
  RETURN QUERY
    SELECT w.id,w.display_name,w.job_title,w.company_id,w.unit_id
    FROM tenant_worker_identity_candidate.links AS l
    JOIN tenant_worker_candidate.workers AS w
      ON w.tenant_id = l.tenant_id AND w.id = l.worker_id AND w.status = 'active'
    JOIN tenant_identity_candidate.accounts AS a ON a.user_id = l.user_id AND a.status = 'active'
    WHERE l.tenant_id = tenant_key AND l.user_id = actor_key AND l.status = 'active';
END
$$;

CREATE FUNCTION tenant_worker_identity_candidate.list_my_worker_links()
RETURNS TABLE(link_tenant_id text,worker_id text,link_status text,linked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor_key text := current_setting('sst.user_id',true);
BEGIN
  IF actor_key IS NULL OR length(trim(actor_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Sessão autenticada é obrigatória.';
  END IF;
  RETURN QUERY
    SELECT l.tenant_id,l.worker_id,l.status,l.created_at
    FROM tenant_worker_identity_candidate.links AS l
    JOIN tenant_identity_candidate.accounts AS a
      ON a.user_id = l.user_id AND a.status = 'active'
    WHERE l.user_id = actor_key AND l.status IN ('pending_review','active')
    ORDER BY l.created_at DESC,l.tenant_id,l.worker_id;
END
$$;
REVOKE ALL ON FUNCTION tenant_worker_identity_candidate.create_invitation(text,text,text,timestamptz,text),
  tenant_worker_identity_candidate.revoke_invitation(uuid,text),
  tenant_worker_identity_candidate.register_worker_from_invitation(text,text,text,text),
  tenant_worker_identity_candidate.accept_invitation(text),
  tenant_worker_identity_candidate.review_link(text,boolean,text,text),
  tenant_worker_identity_candidate.revoke_link(text,text),
  tenant_worker_identity_candidate.read_own_worker(),
  tenant_worker_identity_candidate.list_my_worker_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_worker_identity_candidate.create_invitation(text,text,text,timestamptz,text),
  tenant_worker_identity_candidate.revoke_invitation(uuid,text),
  tenant_worker_identity_candidate.register_worker_from_invitation(text,text,text,text),
  tenant_worker_identity_candidate.accept_invitation(text),
  tenant_worker_identity_candidate.review_link(text,boolean,text,text),
  tenant_worker_identity_candidate.revoke_link(text,text),
  tenant_worker_identity_candidate.read_own_worker(),
  tenant_worker_identity_candidate.list_my_worker_links()
  TO tenant_worker_identity_candidate_app;
