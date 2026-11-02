-- Candidato independente para concessão/revogação de autoridade de cliente.
-- Não é migration do aplicativo e não deve ser aplicado a bancos ativos.
CREATE SCHEMA manager_grant_candidate;
CREATE ROLE manager_grant_candidate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;

-- Referencia tenant_memberships/client_companies/client_units existentes.
-- O user_id é vínculo pré-cadastrado do papel cliente, não conta/senha autenticada.
-- Concedentes recebem autorização separada por empresa, sem inferir permissão por papel.
CREATE TABLE manager_grant_candidate.registrars (
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  company_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_id,user_id,company_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES sst.tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id)
);
CREATE TABLE manager_grant_candidate.grants (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('gestor_contrato','dono_cliente')),
  active boolean NOT NULL DEFAULT true,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by text,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES sst.tenant_memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,company_id) REFERENCES sst.client_companies(tenant_id,id),
  FOREIGN KEY (tenant_id,unit_id) REFERENCES sst.client_units(tenant_id,id),
  CHECK ((active AND revoked_by IS NULL AND revoked_at IS NULL) OR
         (NOT active AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_manager_grant_per_scope
  ON manager_grant_candidate.grants(tenant_id,user_id,company_id,unit_id) WHERE active;
CREATE TABLE manager_grant_candidate.events (
  tenant_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  actor_user_id text NOT NULL,
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,grant_id) REFERENCES manager_grant_candidate.grants(tenant_id,id)
);

ALTER TABLE manager_grant_candidate.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_grant_candidate.grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_grant_candidate.grants
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));
ALTER TABLE manager_grant_candidate.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_grant_candidate.events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON manager_grant_candidate.events
  USING (tenant_id = current_setting('sst.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id',true));

-- Só recebe userId/tenantId da sessão de servidor. A conta, escopo e concedente
-- são revalidados no banco e bloqueados até o fim da concessão/revogação.
CREATE FUNCTION manager_grant_candidate.grant_manager(
  target_user_id text, target_company_id text, target_unit_id text, target_role text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  new_id uuid;
  snapshot_value jsonb;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL OR target_role IS NULL OR target_role NOT IN ('gestor_contrato','dono_cliente') THEN
    RAISE EXCEPTION 'Sessão e papel de decisor válidos são obrigatórios.';
  END IF;
  IF actor_key=target_user_id THEN RAISE EXCEPTION 'O concedente não pode conceder autoridade a si mesmo.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
   WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A conta do concedente não está ativa.'; END IF;
  PERFORM 1 FROM manager_grant_candidate.registrars
   WHERE tenant_id=tenant_key AND user_id=actor_key AND company_id=target_company_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concedente sem autorização administrativa para esta empresa.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
   WHERE tenant_id=tenant_key AND user_id=target_user_id AND role='cliente' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O vínculo de cliente do decisor não está previamente cadastrado e ativo.'; END IF;
  PERFORM 1 FROM sst.client_companies
   WHERE tenant_id=tenant_key AND id=target_company_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A empresa cliente não está ativa neste tenant.'; END IF;
  PERFORM 1 FROM sst.client_units
   WHERE tenant_id=tenant_key AND company_id=target_company_id AND id=target_unit_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa/unidade não pertence a um escopo ativo do cliente.'; END IF;
  INSERT INTO manager_grant_candidate.grants(tenant_id,user_id,company_id,unit_id,role,granted_by)
   VALUES (tenant_key,target_user_id,target_company_id,target_unit_id,target_role,actor_key)
   RETURNING id INTO new_id;
  snapshot_value := jsonb_build_object('userId',target_user_id,'companyId',target_company_id,
    'unitId',target_unit_id,'role',target_role,'grantedBy',actor_key);
  INSERT INTO manager_grant_candidate.events(tenant_id,grant_id,action,actor_user_id,snapshot)
   VALUES (tenant_key,new_id,'granted',actor_key,snapshot_value);
  RETURN new_id;
END $$;

CREATE FUNCTION manager_grant_candidate.revoke_manager(grant_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  entry manager_grant_candidate.grants%ROWTYPE;
BEGIN
  IF tenant_key IS NULL OR actor_key IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  PERFORM 1 FROM sst.tenant_memberships
   WHERE tenant_id=tenant_key AND user_id=actor_key AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A conta do concedente não está ativa.'; END IF;
  SELECT * INTO entry FROM manager_grant_candidate.grants
   WHERE tenant_id=tenant_key AND id=grant_id FOR UPDATE;
  IF NOT FOUND OR NOT entry.active THEN RAISE EXCEPTION 'Vínculo ativo não encontrado.'; END IF;
  PERFORM 1 FROM manager_grant_candidate.registrars
   WHERE tenant_id=tenant_key AND user_id=actor_key AND company_id=entry.company_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concedente sem autorização administrativa para esta empresa.'; END IF;
  UPDATE manager_grant_candidate.grants
   SET active=false,revoked_by=actor_key,revoked_at=clock_timestamp()
   WHERE tenant_id=tenant_key AND id=grant_id;
  INSERT INTO manager_grant_candidate.events(tenant_id,grant_id,action,actor_user_id,snapshot)
   VALUES (tenant_key,grant_id,'revoked',actor_key,jsonb_build_object(
     'userId',entry.user_id,'companyId',entry.company_id,'unitId',entry.unit_id,
     'role',entry.role,'grantedBy',entry.granted_by,'revokedBy',actor_key));
  RETURN true;
END $$;

CREATE FUNCTION manager_grant_candidate.lock_current_grants() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  tenant_key text := current_setting('sst.tenant_id',true);
  actor_key text := current_setting('sst.user_id',true);
  entry manager_grant_candidate.grants%ROWTYPE;
  result jsonb := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM sst.tenant_memberships
   WHERE tenant_id=tenant_key AND user_id=actor_key AND role='cliente' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN result; END IF;
  FOR entry IN SELECT * FROM manager_grant_candidate.grants
    WHERE tenant_id=tenant_key AND user_id=actor_key AND active ORDER BY company_id,unit_id FOR SHARE
  LOOP
    result := result || jsonb_build_array(jsonb_build_object(
      'membershipId',entry.id,'userId',entry.user_id,'tenantId',entry.tenant_id,
      'companyId',entry.company_id,'unitId',entry.unit_id,'role',entry.role));
  END LOOP;
  RETURN result;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA manager_grant_candidate FROM PUBLIC,manager_grant_candidate_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA manager_grant_candidate FROM PUBLIC;
GRANT USAGE ON SCHEMA manager_grant_candidate TO manager_grant_candidate_app;
GRANT EXECUTE ON FUNCTION manager_grant_candidate.grant_manager(text,text,text,text),
  manager_grant_candidate.revoke_manager(uuid), manager_grant_candidate.lock_current_grants()
  TO manager_grant_candidate_app;
