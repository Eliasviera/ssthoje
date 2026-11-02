-- Candidate schema for isolated demonstration trials.
-- No application grants or runtime flow are enabled by this migration.
CREATE TABLE sst.demo_invitations (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'revoked')),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  activated_by text,
  activated_at timestamptz,
  activated_tenant_id text REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE (id, activated_tenant_id),
  CHECK (
    (status = 'pending'
      AND activated_by IS NULL AND activated_at IS NULL AND activated_tenant_id IS NULL
      AND revoked_by IS NULL AND revoked_at IS NULL)
    OR
    (status = 'activated'
      AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND activated_tenant_id IS NOT NULL
      AND revoked_by IS NULL AND revoked_at IS NULL)
    OR
    (status = 'revoked'
      AND activated_by IS NULL AND activated_at IS NULL AND activated_tenant_id IS NULL
      AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE TABLE sst.demo_trials (
  tenant_id text PRIMARY KEY REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL UNIQUE,
  activated_by text NOT NULL CHECK (length(activated_by) BETWEEN 1 AND 200),
  activated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  extension_status text NOT NULL DEFAULT 'none'
    CHECK (extension_status IN ('none', 'pending', 'approved', 'denied')),
  extension_requested_by text,
  extension_requested_at timestamptz,
  extension_decided_by text,
  extension_decided_at timestamptz,
  extended_at timestamptz,
  FOREIGN KEY (invitation_id, tenant_id)
    REFERENCES sst.demo_invitations(id, activated_tenant_id) ON DELETE RESTRICT,
  CHECK (
    (extension_status = 'none'
      AND extension_requested_by IS NULL AND extension_requested_at IS NULL
      AND extension_decided_by IS NULL AND extension_decided_at IS NULL AND extended_at IS NULL
      AND expires_at = activated_at + interval '30 days')
    OR
    (extension_status = 'pending'
      AND extension_requested_by IS NOT NULL AND extension_requested_at IS NOT NULL
      AND extension_decided_by IS NULL AND extension_decided_at IS NULL AND extended_at IS NULL
      AND expires_at = activated_at + interval '30 days')
    OR
    (extension_status = 'denied'
      AND extension_requested_by IS NOT NULL AND extension_requested_at IS NOT NULL
      AND extension_decided_by IS NOT NULL AND extension_decided_at IS NOT NULL AND extended_at IS NULL
      AND expires_at = activated_at + interval '30 days')
    OR
    (extension_status = 'approved'
      AND extension_requested_by IS NOT NULL AND extension_requested_at IS NOT NULL
      AND extension_decided_by IS NOT NULL AND extension_decided_at IS NOT NULL AND extended_at IS NOT NULL
      AND expires_at = activated_at + interval '60 days')
  )
);

CREATE TABLE sst.demo_trial_audit (
  id uuid PRIMARY KEY,
  tenant_id text REFERENCES sst.tenants(id) ON DELETE RESTRICT,
  invitation_id uuid REFERENCES sst.demo_invitations(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  action text NOT NULL CHECK (action IN (
    'invitation_created', 'invitation_activated', 'invitation_revoked',
    'trial_extension_requested', 'trial_extension_approved', 'trial_extension_denied'
  )),
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (invitation_id, tenant_id)
    REFERENCES sst.demo_invitations(id, activated_tenant_id) ON DELETE RESTRICT,
  CHECK (tenant_id IS NOT NULL OR invitation_id IS NOT NULL)
);

CREATE INDEX demo_trial_audit_tenant_time_idx
  ON sst.demo_trial_audit (tenant_id, occurred_at DESC);

CREATE FUNCTION sst.reject_demo_trial_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'demo trial audit is append-only' USING ERRCODE = '55000';
END
$function$;

CREATE FUNCTION sst.enforce_demo_invitation_transition() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'demo invitations cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'pending'
     OR NEW.status NOT IN ('activated', 'revoked')
     OR (to_jsonb(NEW) - ARRAY['status', 'activated_by', 'activated_at', 'activated_tenant_id', 'revoked_by', 'revoked_at'])
        <> (to_jsonb(OLD) - ARRAY['status', 'activated_by', 'activated_at', 'activated_tenant_id', 'revoked_by', 'revoked_at']) THEN
    RAISE EXCEPTION 'demo invitation transition is not allowed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION sst.enforce_demo_trial_transition() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'demo trials cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD.extension_status = 'none'
     AND NEW.extension_status = 'pending'
     AND (to_jsonb(NEW) - ARRAY['extension_status', 'extension_requested_by', 'extension_requested_at'])
        = (to_jsonb(OLD) - ARRAY['extension_status', 'extension_requested_by', 'extension_requested_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.extension_status = 'pending'
     AND NEW.extension_status IN ('approved', 'denied')
     AND (to_jsonb(NEW) - ARRAY['extension_status', 'extension_decided_by', 'extension_decided_at', 'extended_at', 'expires_at'])
        = (to_jsonb(OLD) - ARRAY['extension_status', 'extension_decided_by', 'extension_decided_at', 'extended_at', 'expires_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'demo trial transition is not allowed' USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER demo_invitation_single_use
  BEFORE UPDATE OR DELETE ON sst.demo_invitations
  FOR EACH ROW EXECUTE FUNCTION sst.enforce_demo_invitation_transition();

CREATE TRIGGER demo_trial_extension_once
  BEFORE UPDATE OR DELETE ON sst.demo_trials
  FOR EACH ROW EXECUTE FUNCTION sst.enforce_demo_trial_transition();

CREATE TRIGGER demo_trial_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.demo_trial_audit
  FOR EACH ROW EXECUTE FUNCTION sst.reject_demo_trial_audit_mutation();

CREATE TRIGGER demo_trial_audit_no_truncate
  BEFORE TRUNCATE ON sst.demo_trial_audit
  FOR EACH STATEMENT EXECUTE FUNCTION sst.reject_demo_trial_audit_mutation();

ALTER TABLE sst.demo_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.demo_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY demo_invitations_master_only ON sst.demo_invitations
  USING (current_setting('sst.user_id', true) = 'sst-demo-master')
  WITH CHECK (current_setting('sst.user_id', true) = 'sst-demo-master');

ALTER TABLE sst.demo_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.demo_trials FORCE ROW LEVEL SECURITY;
CREATE POLICY demo_trials_current_tenant ON sst.demo_trials
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));
CREATE POLICY demo_trials_master_read ON sst.demo_trials
  FOR SELECT USING (current_setting('sst.user_id', true) = 'sst-demo-master');

ALTER TABLE sst.demo_trial_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.demo_trial_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY demo_trial_audit_current_tenant ON sst.demo_trial_audit
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));
CREATE POLICY demo_trial_audit_master_read ON sst.demo_trial_audit
  FOR SELECT USING (current_setting('sst.user_id', true) = 'sst-demo-master');

REVOKE ALL ON sst.demo_invitations, sst.demo_trials, sst.demo_trial_audit FROM PUBLIC, sst_hoje_app;
