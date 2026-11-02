-- CANDIDATO: fora de db/migrations. Não aplicar ao banco ativo.
-- Modelo de leitura/importação; não habilita operações do painel.
-- Pré-requisitos: schema sst, tenants, client_companies e client_units de 0001–0005.
-- Payloads preservam os campos originais. Arrays de recibos/eventos são reconstruídos.

CREATE TABLE sst.third_party_invitation_snapshots (
  tenant_id text NOT NULL REFERENCES sst.tenants(id),
  id text NOT NULL,
  company_id text NOT NULL,
  unit_id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, source_order),
  FOREIGN KEY (tenant_id, company_id) REFERENCES sst.client_companies(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id, company_id) REFERENCES sst.client_units(tenant_id, id, company_id),
  CHECK ((payload->>'id' = id AND payload->>'tenantId' = tenant_id AND payload->>'companyId' = company_id AND payload->>'unitId' = unit_id) IS TRUE),
  CHECK (NOT payload ? 'receipts' AND NOT payload ? 'issues')
);

CREATE TABLE sst.third_party_receipt_snapshots (
  tenant_id text NOT NULL, invitation_id text NOT NULL, id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, invitation_id, id), UNIQUE (tenant_id, invitation_id, source_order),
  FOREIGN KEY (tenant_id, invitation_id) REFERENCES sst.third_party_invitation_snapshots(tenant_id, id),
  CHECK ((payload->>'id' = id) IS TRUE)
);

CREATE TABLE sst.third_party_issue_snapshots (
  tenant_id text NOT NULL, invitation_id text NOT NULL, id text NOT NULL,
  original_receipt_id text NOT NULL, current_receipt_id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, invitation_id, id), UNIQUE (tenant_id, invitation_id, source_order),
  FOREIGN KEY (tenant_id, invitation_id) REFERENCES sst.third_party_invitation_snapshots(tenant_id, id),
  FOREIGN KEY (tenant_id, invitation_id, original_receipt_id) REFERENCES sst.third_party_receipt_snapshots(tenant_id, invitation_id, id),
  FOREIGN KEY (tenant_id, invitation_id, current_receipt_id) REFERENCES sst.third_party_receipt_snapshots(tenant_id, invitation_id, id),
  CHECK ((payload->>'id' = id AND payload->>'originalReceiptId' = original_receipt_id AND payload->>'currentReceiptId' = current_receipt_id) IS TRUE),
  CHECK (NOT payload ? 'events')
);

CREATE TABLE sst.third_party_issue_event_snapshots (
  tenant_id text NOT NULL, invitation_id text NOT NULL, issue_id text NOT NULL, id text NOT NULL,
  receipt_id text NOT NULL, source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, issue_id, source_order),
  FOREIGN KEY (tenant_id, invitation_id, issue_id) REFERENCES sst.third_party_issue_snapshots(tenant_id, invitation_id, id),
  FOREIGN KEY (tenant_id, invitation_id, receipt_id) REFERENCES sst.third_party_receipt_snapshots(tenant_id, invitation_id, id),
  CHECK ((payload->>'id' = id AND payload->>'receiptId' = receipt_id) IS TRUE)
);

CREATE TABLE sst.third_party_approval_snapshots (
  tenant_id text NOT NULL, invitation_id text NOT NULL, id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, invitation_id, id), UNIQUE (tenant_id, source_order),
  FOREIGN KEY (tenant_id, invitation_id) REFERENCES sst.third_party_invitation_snapshots(tenant_id, id),
  CHECK ((payload->>'id' = id AND payload->>'tenantId' = tenant_id AND payload->>'invitationId' = invitation_id) IS TRUE)
);

CREATE TABLE sst.third_party_schedule_snapshots (
  tenant_id text NOT NULL, invitation_id text NOT NULL, approval_id text NOT NULL, id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, source_order),
  FOREIGN KEY (tenant_id, invitation_id, approval_id) REFERENCES sst.third_party_approval_snapshots(tenant_id, invitation_id, id),
  CHECK ((payload->>'id' = id AND payload->>'tenantId' = tenant_id AND payload->>'invitationId' = invitation_id AND payload->>'approvalId' = approval_id) IS TRUE)
);

CREATE TABLE sst.third_party_audit_snapshots (
  tenant_id text NOT NULL REFERENCES sst.tenants(id), id text NOT NULL,
  source_order bigint NOT NULL CHECK (source_order >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, source_order),
  CHECK ((payload->>'id' = id AND payload->>'tenantId' = tenant_id) IS TRUE),
  CHECK ((payload->>'action' LIKE 'thirdparty.%') IS TRUE)
);

CREATE FUNCTION sst.reject_third_party_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Third party import snapshots are immutable' USING ERRCODE = '55000';
END
$function$;

-- Nenhum INSERT/UPDATE/DELETE/TRUNCATE concedido ao papel de aplicação.
-- RLS é defesa adicional; autorização de usuário permanece no serviço servidor.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'third_party_invitation_snapshots', 'third_party_receipt_snapshots',
    'third_party_issue_snapshots', 'third_party_issue_event_snapshots',
    'third_party_approval_snapshots', 'third_party_schedule_snapshots', 'third_party_audit_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE sst.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE sst.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY current_tenant ON sst.%I USING (tenant_id = current_setting(''sst.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''sst.tenant_id'', true))', table_name);
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON sst.%I FOR EACH ROW EXECUTE FUNCTION sst.reject_third_party_snapshot_mutation()', table_name);
    EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON sst.%I FOR EACH STATEMENT EXECUTE FUNCTION sst.reject_third_party_snapshot_mutation()', table_name);
    EXECUTE format('REVOKE ALL ON sst.%I FROM PUBLIC, sst_hoje_app', table_name);
    EXECUTE format('GRANT SELECT ON sst.%I TO sst_hoje_app', table_name);
  END LOOP;
END
$block$;
