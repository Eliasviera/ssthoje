import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { prepareLegacyReceiptPrivateObject } from "../src/lib/third-party-legacy-storage-verification.ts";
import { createLocalPrivateObjectStore, readRegisteredPrivateObjectSnapshot } from "../src/lib/third-party-private-filesystem-store.ts";

// Etapa A and selected Etapa B candidate proof. This script never reads
// environment files, publishes a port, mounts a volume, or connects to the app DB.
const container = `sst-m22-evidence-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(24).toString("hex");
const docker = (args, input) => execFileSync("docker", args, {
  encoding: "utf8", input, stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"], timeout: 30000,
}).trim();
let started = false;
let stage = "start";
let privateStorageRoot;

function psql(sql, expectedCode) {
  let output;
  try {
    output = docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", "sst_hoje_dev"], sql);
  } catch (error) {
    const stderr = String(error.stderr ?? error.message);
    if (expectedCode) {
      assert.match(stderr, new RegExp(`(?:\\[${expectedCode}\\]|\\b${expectedCode}\\b)`), `Esperava SQLSTATE ${expectedCode}: ${stderr}`);
      return stderr;
    }
    throw error;
  }
  if (expectedCode) assert.fail(`Esperava SQLSTATE ${expectedCode}, mas o comando SQL teve sucesso: ${String(output).slice(0, 500)}`);
  return output;
}

function expectSqlFailure(label, code, sql) {
  try {
    docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", "sst_hoje_dev"], sql);
  } catch (error) {
    const stderr = String(error.stderr ?? error.message);
    assert.match(stderr, new RegExp(`(?:\\[${code}\\]|\\b${code}\\b)`), `${label}: esperava SQLSTATE ${code}: ${stderr}`);
    return;
  }
  assert.fail(`${label}: SQL command unexpectedly succeeded`);
}

function dockerAsync(args, input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", code => {
      if (code === 0) resolvePromise(stdout.trim());
      else rejectPromise(Object.assign(new Error(stderr || stdout || `docker exited ${code}`), { stderr, stdout, code }));
    });
    child.stdin.end(input);
  });
}

async function apply(path) {
  psql(await readFile(resolve(path), "utf8"));
}

try {
  docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=sst_hoje_dev", "postgres:17"]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const logs = docker(["logs", container]);
      // The official image briefly starts a bootstrap server, then shuts it
      // down before launching the final server. Do not accept bootstrap readiness.
      if (logs.includes("PostgreSQL init process complete; ready for start up.")) {
        docker(["exec", container, "pg_isready", "-q", "-U", "postgres", "-d", "sst_hoje_dev"]);
        ready = true;
        break;
      }
    }
    catch { await new Promise(done => setTimeout(done, 500)); }
    if (!ready) await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(ready, "PostgreSQL descartável não ficou pronto");

  stage = "migrations and candidate schemas";
  psql("CREATE SCHEMA sst;");
  await apply("db/migrations/0001_tenant_registry.sql");
  await apply("db/migrations/0004_client_companies.sql");
  await apply("db/migrations/0005_pgr_risk_inventory.sql");
  await apply("../../schemas/tenant-authority-candidate.sql");
  for (const path of [
    "../../schemas/operational-authority-grants-candidate.sql",
    "../../schemas/third-party-evidence-candidate.sql",
    "../../schemas/third-party-workforce-candidate.sql",
    "../../schemas/third-party-legacy-reconciliation-candidate.sql",
    "../../schemas/third-party-legacy-reconciliation-functions-candidate.sql",
  ]) await apply(path);
  psql("GRANT CREATE ON SCHEMA third_party_legacy_reconciliation_candidate TO third_party_legacy_reconciliation_candidate_executor;");
  await apply("../../schemas/third-party-legacy-reconciliation-panel-read-functions-candidate.sql");
  psql("REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate FROM third_party_legacy_reconciliation_candidate_executor;");

  stage = "candidate catalog invariants";
  const catalogCounts = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY['operational_authority_candidate','third_party_evidence_candidate','third_party_workforce_candidate','third_party_legacy_reconciliation_candidate']) AND c.relkind='r') || '|' ||
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY['operational_authority_candidate','third_party_evidence_candidate','third_party_workforce_candidate','third_party_legacy_reconciliation_candidate']) AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) || '|' ||
      (SELECT count(*) FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY['operational_authority_candidate','third_party_evidence_candidate','third_party_workforce_candidate','third_party_legacy_reconciliation_candidate']) AND f.contype='f');
  `);
  assert.equal(catalogCounts, "36|36|115", "Esperava 36 tabelas com RLS forçada e 115 FKs candidatas");
  await apply("../../schemas/operational-authority-case-provisioning-functions-candidate.sql");
  const provisionedCatalog = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operational_authority_candidate' AND c.relkind='r') || '|' ||
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operational_authority_candidate' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) || '|' ||
      (SELECT count(*) FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operational_authority_candidate' AND f.contype='f') || '|' ||
      (SELECT (NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls)::text FROM pg_roles r WHERE r.rolname='operational_authority_case_executor');
  `);
  assert.equal(provisionedCatalog, "24|24|80|true", "Provisionamento deve manter RLS/FKs e executor NOLOGIN sem bypass");

  stage = "synthetic fixtures";
  psql(`
    INSERT INTO sst.tenants(id,name,status) VALUES
      ('tenant-a','Tenant A fictício','active'),('tenant-b','Tenant B fictício','active'),
      ('tenant-c','Tenant C fictício','active'),('tenant-d','Tenant D fictício suspenso','suspended'),
      ('tenant-e','Tenant E fictício','active');
    SELECT tenant_authority_candidate.bootstrap_tenant('tenant-a','consultancy','user-a','Admin consultoria A fictício');
    SELECT tenant_authority_candidate.bootstrap_tenant('tenant-b','consultancy','user-b','Admin consultoria B fictício');
    SELECT tenant_authority_candidate.bootstrap_tenant('tenant-c','direct_client','user-c','Admin cliente C fictício');
    -- Simulate stale pre-profile state to prove bootstrap never elevates membership.
    SET session_replication_role=replica;
    INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name) VALUES
      ('tenant-e','user-existing','cliente','active','Membership existente fictícia');
    SET session_replication_role=origin;
    INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name) VALUES
      ('tenant-a','user-client','cliente','active','Cliente fictício'),
      ('tenant-a','user-client-authority','cliente','active','Autoridade cliente fictícia'),
      ('tenant-a','user-client-revoked','cliente','active','Representante revogado fictício'),
      ('tenant-a','user-client-suspended','cliente','suspended','Autoridade cliente suspensa fictícia'),
      ('tenant-a','user-suspended','consultoria_admin','suspended','Operador suspenso fictício'),
      ('tenant-c','user-client-c','cliente','active','Usuário cliente C fictício');
    INSERT INTO sst.client_companies(tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at) VALUES
      ('tenant-a','company-a','Cliente A fictício','','','a@example.test','','active',now(),now()),
      ('tenant-b','company-b','Cliente B fictício','','','b@example.test','','active',now(),now());
    INSERT INTO sst.client_units(tenant_id,id,company_id,cnpj,name,city_state) VALUES
      ('tenant-a','unit-a','company-a','00000000000001','Unidade A fictícia','São Paulo/SP'),
      ('tenant-b','unit-b','company-b','00000000000002','Unidade B fictícia','Curitiba/PR');
    INSERT INTO operational_authority_candidate.third_parties(tenant_id,id,cnpj,legal_name,created_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000000a','11111111111111','Contratada A fictícia','user-a'),
      ('tenant-b','00000000-0000-4000-8000-00000000000b','22222222222222','Contratada B fictícia','user-b');
    INSERT INTO operational_authority_candidate.third_party_cases(tenant_id,id,company_id,unit_id,third_party_id,work_scope,created_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000010a','company-a','unit-a','00000000-0000-4000-8000-00000000000a','Manutenção fictícia','user-a'),
      ('tenant-b','00000000-0000-4000-8000-00000000010b','company-b','unit-b','00000000-0000-4000-8000-00000000000b','Inspeção fictícia','user-b');
    INSERT INTO third_party_evidence_candidate.private_file_objects(tenant_id,id,backend_code,object_locator,content_sha256,byte_size,registered_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000020a','proof','opaque-a','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,'user-a'),
      ('tenant-b','00000000-0000-4000-8000-00000000020b','proof','opaque-b','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',20,'user-b');
    INSERT INTO third_party_evidence_candidate.private_file_object_events(tenant_id,id,object_id,event_type,content_sha256,byte_size,actor_user_id,reason) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000030a','00000000-0000-4000-8000-00000000020a','verified','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,'user-a','Fixture sintética de prova'),
      ('tenant-b','00000000-0000-4000-8000-00000000030b','00000000-0000-4000-8000-00000000020b','verified','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',20,'user-b','Fixture sintética de prova');
    INSERT INTO third_party_evidence_candidate.private_file_object_event_heads(tenant_id,object_id,event_id) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000020a','00000000-0000-4000-8000-00000000030a'),
      ('tenant-b','00000000-0000-4000-8000-00000000020b','00000000-0000-4000-8000-00000000030b');
    INSERT INTO third_party_evidence_candidate.document_series(tenant_id,id,third_party_id,document_kind,display_label,created_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000040a','00000000-0000-4000-8000-00000000000a','PGR','PGR fictício','user-a');
    INSERT INTO third_party_evidence_candidate.document_versions(tenant_id,id,series_id,third_party_id,document_kind,revision,storage_object_id,file_name,content_sha256,byte_size,received_by,state) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000050a','00000000-0000-4000-8000-00000000040a','00000000-0000-4000-8000-00000000000a','PGR',1,'00000000-0000-4000-8000-00000000020a','pgr-sintetico.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,'user-a','current');
    INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,content_sha256,byte_size,source_received_at,source_valid_until,imported_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000060a','third-party-json','invite-sintetico','receipt-sintetico','PGR','pgr-sintetico.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'2027-12-31','user-a');
    DO $$ BEGIN
      IF (SELECT source_valid_until FROM third_party_legacy_reconciliation_candidate.legacy_receipts WHERE tenant_id='tenant-a' AND id='00000000-0000-4000-8000-00000000060a') IS DISTINCT FROM DATE '2027-12-31' THEN
        RAISE EXCEPTION 'legacy receipt validity was not preserved';
      END IF;
    END $$;
    INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(tenant_id,legacy_receipt_id,source_kind,revision,event_type,rationale,actor_user_id) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000060a','PGR',1,'pending','Pendente de revisão manual','user-a');
    INSERT INTO third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots(tenant_id,id,source_store,source_invitation_id,revision,source_company_id,source_unit_id,contractor_cnpj,scope_text,requested_categories,context_sha256,captured_by) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000060b','third-party-json','invite-sintetico',1,'company-a','unit-a','11111111111111','Manutenção fictícia',ARRAY['PGR'],'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','user-a');
    INSERT INTO third_party_legacy_reconciliation_candidate.invitation_case_link_events(tenant_id,id,source_store,source_invitation_id,snapshot_id,context_sha256,revision,event_type,company_id,unit_id,third_party_id,workflow_id,rationale,actor_user_id) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000060c','third-party-json','invite-sintetico','00000000-0000-4000-8000-00000000060b','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',1,'linked','company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','Vínculo fictício confirmado','user-client-authority');
    INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(tenant_id,legacy_receipt_id,source_kind,revision,event_type,company_id,unit_id,third_party_id,workflow_id,document_series_id,document_version_id,invitation_case_link_event_id,target_document_kind,rationale,actor_user_id) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000060a','PGR',2,'matched','company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','00000000-0000-4000-8000-00000000040a','00000000-0000-4000-8000-00000000050a','00000000-0000-4000-8000-00000000060c','PGR','Associação fictícia confirmada','user-a');
    INSERT INTO operational_authority_candidate.client_registrars(tenant_id,id,user_id,company_id,unit_id,designated_by,designation_reference) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000070a','user-a','company-a','unit-a','user-client','Designação fictícia da prova'),
      ('tenant-a','00000000-0000-4000-8000-00000000070b','user-client-authority','company-a','unit-a','user-a','Designação fictícia da prova'),
      ('tenant-a','00000000-0000-4000-8000-00000000070c','user-client-revoked','company-a','unit-a','user-a','Designação fictícia revogada');
    INSERT INTO operational_authority_candidate.registrar_events(tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000070a','designated','user-client','Confirmação cliente fictícia','{}'),
      ('tenant-a','00000000-0000-4000-8000-00000000070b','designated','user-client','Confirmação cliente fictícia','{}'),
      ('tenant-a','00000000-0000-4000-8000-00000000070c','designated','user-client','Confirmação cliente fictícia','{}'),
      ('tenant-a','00000000-0000-4000-8000-00000000070c','revoked','user-a','Revogação fictícia','{}');
    INSERT INTO operational_authority_candidate.analyst_assignments(tenant_id,id,analyst_user_id,assignment_kind,company_id,unit_id,third_party_id,workflow_id,qualification_status,authorized_by_registrar_id) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000071a','user-a','consultancy_sst','company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','unverified','00000000-0000-4000-8000-00000000070a');
    INSERT INTO operational_authority_candidate.policy_requirement_catalog(tenant_id,company_id,unit_id,requirement_code,title,created_by) VALUES
      ('tenant-a','company-a','unit-a','PGR_PRESENT','PGR apresentado','user-a');
    INSERT INTO operational_authority_candidate.policy_versions(tenant_id,id,company_id,unit_id,version,effective_at,published_by,reviewed_by,reviewed_at,source_fingerprint) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000072a','company-a','unit-a',1,now(),'user-a','user-a',now(),'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    INSERT INTO operational_authority_candidate.policy_items(tenant_id,policy_version_id,company_id,unit_id,requirement_code,effect,reference_snapshot,evidence_rule_snapshot) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000072a','company-a','unit-a','PGR_PRESENT','requirement','{}','{}');
    INSERT INTO operational_authority_candidate.technical_assessments(tenant_id,id,company_id,unit_id,third_party_id,workflow_id,policy_version_id,assignment_id,assessment_revision,assessed_by,rationale,source_fingerprint) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000073a','company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','00000000-0000-4000-8000-00000000072a','00000000-0000-4000-8000-00000000071a',1,'user-a','Avaliação técnica fictícia','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    INSERT INTO operational_authority_candidate.technical_assessment_items(tenant_id,assessment_id,policy_version_id,requirement_code,technical_state,rationale) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000073a','00000000-0000-4000-8000-00000000072a','PGR_PRESENT','conforming','Documento fictício conferido');
    INSERT INTO operational_authority_candidate.technical_assessment_sources(tenant_id,assessment_id,source_kind,source_id,source_revision,source_fingerprint) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000073a','documents','documents-snapshot-a',1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','requirements','requirements-snapshot-a',1,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','evaluations','evaluations-snapshot-a',1,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','policies','policies-snapshot-a',1,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','criteria','criteria-snapshot-a',1,'9999999999999999999999999999999999999999999999999999999999999999');
    INSERT INTO operational_authority_candidate.technical_assessment_source_members(tenant_id,assessment_id,source_kind,snapshot_source_id,snapshot_source_revision,member_source_id,member_source_revision,member_source_fingerprint) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000073a','documents','documents-snapshot-a',1,'pgr-version-a',1,'1111111111111111111111111111111111111111111111111111111111111111'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','requirements','requirements-snapshot-a',1,'requirement-applicability-a',1,'2222222222222222222222222222222222222222222222222222222222222222'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','evaluations','evaluations-snapshot-a',1,'legacy-evaluation-a',1,'3333333333333333333333333333333333333333333333333333333333333333'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','criteria','criteria-snapshot-a',1,'criterion-a',1,'4444444444444444444444444444444444444444444444444444444444444444');
    INSERT INTO operational_authority_candidate.technical_assessment_item_sources(tenant_id,assessment_id,requirement_code,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint,reference_role) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','documents','documents-snapshot-a',1,'pgr-version-a',1,'1111111111111111111111111111111111111111111111111111111111111111','evidence'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','requirements','requirements-snapshot-a',1,'requirement-applicability-a',1,'2222222222222222222222222222222222222222222222222222222222222222','applicability_basis'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','evaluations','evaluations-snapshot-a',1,'legacy-evaluation-a',1,'3333333333333333333333333333333333333333333333333333333333333333','prior_evaluation'),
      ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','criteria','criteria-snapshot-a',1,'criterion-a',1,'4444444444444444444444444444444444444444444444444444444444444444','criterion');
  `);
  const scopedCaseOptions = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id='tenant-a';
    SET LOCAL sst.user_id='user-a';
    SELECT case_id || '|' || company_id || '|' || unit_id
      FROM third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases();
    ROLLBACK;
  `);
  assert.equal(scopedCaseOptions, "00000000-0000-4000-8000-00000000010a|company-a|unit-a",
    "a lista de casos deve retornar somente casos do tenant da sessão");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    SELECT p.operating_mode || '|' || m.role || '|' ||
      (SELECT string_agg(g.role,',' ORDER BY g.role) FROM tenant_authority_candidate.admin_grants AS g
        WHERE g.tenant_id=p.tenant_id AND g.user_id=m.user_id AND g.active)
      FROM tenant_authority_candidate.tenant_profiles AS p
      JOIN sst.tenant_memberships AS m ON m.tenant_id=p.tenant_id
     WHERE (p.tenant_id='tenant-a' AND m.user_id='user-a')
        OR (p.tenant_id='tenant-c' AND m.user_id='user-c')
     ORDER BY p.tenant_id;
  `), "consultancy|consultoria_admin|tenant_admin\ndirect_client|cliente|tenant_admin,tenant_owner",
  "admin de consultoria e admin do cliente direto devem ser provisionados segundo titularidade");
  psql(`SELECT tenant_authority_candidate.bootstrap_tenant('tenant-a','direct_client','user-a','Admin divergente');`, "P0001");
  psql(`BEGIN; SET LOCAL ROLE tenant_authority_candidate_app;
    SELECT tenant_authority_candidate.bootstrap_tenant('tenant-c','direct_client','user-c','Admin cliente');`, "42501");
  psql(`SELECT tenant_authority_candidate.bootstrap_tenant('tenant-d','direct_client','user-d','Admin tenant suspenso');`, "P0001");
  psql(`SELECT tenant_authority_candidate.bootstrap_tenant('tenant-e','direct_client','user-existing','Tentativa de elevar membership existente');`, "P0001");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    SELECT
      (SELECT count(*) FROM tenant_authority_candidate.tenant_profiles WHERE tenant_id IN ('tenant-d','tenant-e')) || '|' ||
      (SELECT role FROM sst.tenant_memberships WHERE tenant_id='tenant-e' AND user_id='user-existing') || '|' ||
      (SELECT count(*) FROM tenant_authority_candidate.admin_grants WHERE tenant_id='tenant-e');
  `), "0|cliente|0", "falha de bootstrap nao deve criar perfil nem elevar membership existente");

  stage = "trusted third-party and client-confirmed case provisioning";
  const thirdPartyRequestId = "00000000-0000-4000-8000-00000000081a";
  const thirdPartyArgs = `'${thirdPartyRequestId}','33333333333333','Contratada revisada fictícia','Cadastro conferido por revisor humano fictício'`;
  const caseRequestId = "00000000-0000-4000-8000-00000000082a";
  const trustedCall = (role, userId, functionName, args) => `BEGIN;
    SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${role}',true);
    SELECT * FROM operational_authority_candidate.${functionName}(${args});`;
  const operatorCall = (role, userId, functionName, args) => `BEGIN;
    SET LOCAL ROLE operational_authority_designation_operator;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${role}',true);
    SELECT * FROM operational_authority_candidate.${functionName}(${args});`;
  const visibleMemberships = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    "BEGIN; SET LOCAL ROLE operational_authority_case_executor; SET LOCAL sst.tenant_id='tenant-a'; SET LOCAL sst.user_id='user-a'; SELECT role FROM sst.tenant_memberships WHERE tenant_id='tenant-a' AND user_id='user-client' AND status='active' FOR SHARE; ROLLBACK;");
  assert.equal(visibleMemberships, "cliente", "executor deve bloquear e validar o papel ativo do destinatário no tenant corrente");
  const designationRequestId = "00000000-0000-4000-8000-00000000087a";
  const designationArgs = `'${designationRequestId}','user-client','company-a','unit-a','authority-ref-synthetic-1','Nomeação legal fictícia conferida por operador humano',NULL`;
  psql(`BEGIN; SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM operational_authority_candidate.propose_client_registrar_after_review(${designationArgs});`, "42501");
  psql(operatorCall("cliente", "user-client", "propose_client_registrar_after_review", designationArgs) + " COMMIT;", "42501");
  psql(operatorCall("consultoria_admin", "user-a", "propose_client_registrar_after_review",
    `'00000000-0000-4000-8000-00000000088a','user-a','company-a','unit-a','authority-ref-invalid','Designação fictícia para usuário sem papel cliente',NULL`) + " COMMIT;", "42501");
  expectSqlFailure("designation proposal rejects company and unit outside tenant", "23503", operatorCall("consultoria_admin", "user-a", "propose_client_registrar_after_review",
    `'00000000-0000-4000-8000-00000000089a','user-client','company-b','unit-b','authority-ref-cross-tenant','Designação fictícia para outra empresa',NULL`) + " COMMIT;");
  psql(`BEGIN; SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM operational_authority_candidate.confirm_client_registrar_designation('00000000-0000-4000-8000-00000000087a','00000000-0000-4000-8000-00000000070a','authority-ref-client-synthetic','Confirmação cliente fictícia por pessoa independente');`, "42501");
  psql(trustedCall("cliente", "user-client", "confirm_client_registrar_designation",
    `'${designationRequestId}','00000000-0000-4000-8000-00000000070a','authority-ref-self-confirm','Tentativa de auto confirmação fictícia'`) + " COMMIT;", "42501");
  psql(trustedCall("cliente", "user-client-suspended", "confirm_client_registrar_designation",
    `'${designationRequestId}','00000000-0000-4000-8000-00000000070a','authority-ref-suspended','Tentativa por membership suspensa'`) + " COMMIT;", "42501");
  psql(`
    BEGIN;
    SET LOCAL ROLE operational_authority_designation_operator;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $proof$
    DECLARE first_result record; retry_result record;
    BEGIN
      SELECT * INTO first_result FROM operational_authority_candidate.propose_client_registrar_after_review('${designationRequestId}','user-client','company-a','unit-a','authority-ref-synthetic-1','Nomeação legal fictícia conferida por operador humano',NULL);
      SELECT * INTO retry_result FROM operational_authority_candidate.propose_client_registrar_after_review('${designationRequestId}','user-client','company-a','unit-a','authority-ref-synthetic-1','Nomeação legal fictícia conferida por operador humano',NULL);
      IF first_result.inserted IS DISTINCT FROM true OR retry_result.inserted IS DISTINCT FROM false
         OR retry_result.registrar_id IS DISTINCT FROM first_result.registrar_id THEN
        RAISE EXCEPTION 'registrar designation retry was not idempotent';
      END IF;
    END $proof$;
    COMMIT;
  `);
  const registrarId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT registrar_id FROM operational_authority_candidate.registrar_events WHERE tenant_id='tenant-a' AND event_type='proposed' AND snapshot->>'requestId'='${designationRequestId}';`);
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT (SELECT count(*) FROM operational_authority_candidate.registrar_events WHERE tenant_id='tenant-a' AND registrar_id='${registrarId}' AND event_type='proposed') || '|' || (SELECT count(*) FROM operational_authority_candidate.registrar_events WHERE tenant_id='tenant-a' AND registrar_id='${registrarId}' AND event_type='designated');`), "1|0");
  psql(operatorCall("consultoria_admin", "user-a", "propose_client_registrar_after_review",
    `'00000000-0000-4000-8000-00000000090a','user-client','company-a','unit-a','authority-ref-synthetic-2','Segunda designação ativa não pode duplicar',NULL`) + " COMMIT;", "23505");
  psql(operatorCall("consultoria_admin", "user-a", "propose_client_registrar_after_review",
    `'${designationRequestId}','user-client','company-a','unit-a','authority-ref-synthetic-1','Payload divergente no retry',NULL`) + " COMMIT;", "40001");
  psql(trustedCall("cliente", "user-client", "create_client_confirmed_case",
    `'${caseRequestId}','${registrarId}','company-a','unit-a','00000000-0000-4000-8000-00000000000a','Escopo pendente fictício','Caso não deve existir antes da confirmação independente'`) + " COMMIT;", "42501");
  const confirmationReference = "client-authority-confirmation-synthetic-1";
  const confirmationRationale = "Responsável cliente fictício confirmou a designação após revisão independente";
  const confirmationArgs = `'${designationRequestId}','${registrarId}','${confirmationReference}','${confirmationRationale}'`;
  const confirmationPsqlArgs = ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", "sst_hoje_dev"];
  const confirmationRaceSql = `BEGIN; SET LOCAL ROLE operational_authority_case_executor;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-client-authority',true), set_config('sst.membership_role','cliente',true);
    SELECT pg_advisory_xact_lock(hashtextextended('m22-client-registrar:tenant-a:${registrarId}',0));
    SELECT pg_sleep(0.8);
    SELECT * FROM operational_authority_candidate.confirm_client_registrar_designation(${confirmationArgs});
    COMMIT;`;
  const firstConfirmationRace = dockerAsync(confirmationPsqlArgs, confirmationRaceSql);
  await new Promise(done => setTimeout(done, 200));
  const secondConfirmationRace = dockerAsync(confirmationPsqlArgs,
    confirmationRaceSql.replace("SELECT pg_sleep(0.8);", "SELECT pg_sleep(0.0);"));
  const [firstConfirmationResult, secondConfirmationResult] = await Promise.all([
    firstConfirmationRace, secondConfirmationRace,
  ]);
  assert.ok(firstConfirmationResult.includes("|t"), "primeira confirmação concorrente deve publicar a designação");
  assert.ok(secondConfirmationResult.includes("|f"), "confirmação repetida concorrente deve retornar a designação publicada");
  psql(`
    BEGIN;
    SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-client-authority',true), set_config('sst.membership_role','cliente',true);
    DO $proof$
    DECLARE retry_result record;
    BEGIN
      SELECT * INTO retry_result FROM operational_authority_candidate.confirm_client_registrar_designation('${designationRequestId}','${registrarId}','${confirmationReference}','${confirmationRationale}');
      IF retry_result.inserted IS DISTINCT FROM false THEN RAISE EXCEPTION 'client designation confirmation retry was not idempotent'; END IF;
    END $proof$;
    COMMIT;
  `);
  psql(trustedCall("cliente", "user-client-authority", "confirm_client_registrar_designation",
    `'${designationRequestId}','${registrarId}','different-confirmation-reference','${confirmationRationale}'`) + " COMMIT;", "40001");

  psql(`
    BEGIN;
    SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $proof$
    DECLARE first_result record; retry_result record;
    BEGIN
      SELECT * INTO first_result FROM operational_authority_candidate.register_reviewed_third_party('${thirdPartyRequestId}','33333333333333','Contratada revisada fictícia','Cadastro conferido por revisor humano fictício');
      SELECT * INTO retry_result FROM operational_authority_candidate.register_reviewed_third_party('${thirdPartyRequestId}','33333333333333','Contratada revisada fictícia','Cadastro conferido por revisor humano fictício');
      IF first_result.inserted IS DISTINCT FROM true OR retry_result.inserted IS DISTINCT FROM false
         OR retry_result.third_party_id IS DISTINCT FROM first_result.third_party_id THEN
        RAISE EXCEPTION 'third-party registration retry was not idempotent';
      END IF;
    END $proof$;
    COMMIT;
  `);
  const registeredThirdPartyId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT third_party_id FROM operational_authority_candidate.third_party_registration_events WHERE tenant_id='tenant-a' AND request_id='${thirdPartyRequestId}';`);
  const caseArgs = `'${caseRequestId}','${registrarId}','company-a','unit-a','${registeredThirdPartyId}','Instalação de equipamento fictícia','Representante do cliente confirmou empresa, unidade, contratada e escopo'`;
  psql(trustedCall("cliente", "user-client", "create_client_confirmed_case", caseArgs) + " COMMIT;");
  psql(`
    BEGIN;
    SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-client',true), set_config('sst.membership_role','cliente',true);
    DO $proof$
    DECLARE retry_result record;
    BEGIN
      SELECT * INTO retry_result FROM operational_authority_candidate.create_client_confirmed_case('${caseRequestId}','${registrarId}','company-a','unit-a','${registeredThirdPartyId}','Instalação de equipamento fictícia','Representante do cliente confirmou empresa, unidade, contratada e escopo');
      IF retry_result.inserted IS DISTINCT FROM false THEN RAISE EXCEPTION 'case retry was not idempotent'; END IF;
    END $proof$;
    COMMIT;
  `);
  psql(trustedCall("cliente", "user-client", "register_reviewed_third_party", thirdPartyArgs) + " COMMIT;", "42501");
  psql(trustedCall("consultoria_admin", "user-a", "create_client_confirmed_case", caseArgs) + " COMMIT;", "42501");
  psql(trustedCall("cliente", "user-client", "create_client_confirmed_case", caseArgs
    .replace(caseRequestId, "00000000-0000-4000-8000-00000000086a")
    .replace("'company-a','unit-a'", "'company-b','unit-b'")) + " COMMIT;", "23503");
  psql(trustedCall("consultoria_admin", "user-a", "register_reviewed_third_party", `'${thirdPartyRequestId}','33333333333333','Nome alterado','Cadastro conferido por revisor humano fictício'`) + " COMMIT;", "40001");
  psql(trustedCall("consultoria_admin", "user-a", "register_reviewed_third_party", `'00000000-0000-4000-8000-00000000083a','33333333333333','Outra identidade','Cadastro duplicado não pode mesclar'`) + " COMMIT;", "23505");
  psql(trustedCall("cliente", "user-client", "create_client_confirmed_case", caseArgs.replace("Instalação de equipamento fictícia","Escopo diferente")) + " COMMIT;", "40001");
  const revokeRequestId = "00000000-0000-4000-8000-00000000091a";
  const revokeArgs = `'${revokeRequestId}','${registrarId}','Revogação fictícia após conferência humana registrada'`;
  psql(`BEGIN; SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM operational_authority_candidate.revoke_client_registrar_after_review(${revokeArgs});`, "42501");
  psql(`
    BEGIN;
    SET LOCAL ROLE operational_authority_designation_operator;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $proof$
    DECLARE first_result record; retry_result record;
    BEGIN
      SELECT * INTO first_result FROM operational_authority_candidate.revoke_client_registrar_after_review('${revokeRequestId}','${registrarId}','Revogação fictícia após conferência humana registrada');
      SELECT * INTO retry_result FROM operational_authority_candidate.revoke_client_registrar_after_review('${revokeRequestId}','${registrarId}','Revogação fictícia após conferência humana registrada');
      IF first_result.inserted IS DISTINCT FROM true OR retry_result.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'registrar revocation retry was not idempotent';
      END IF;
    END $proof$;
    COMMIT;
  `);
  psql(operatorCall("consultoria_admin", "user-a", "revoke_client_registrar_after_review",
    revokeArgs.replace("Revogação fictícia após conferência humana registrada", "Payload divergente na revogação repetida")) + " COMMIT;", "40001");
  psql(trustedCall("cliente", "user-client", "create_client_confirmed_case", caseArgs
    .replace(caseRequestId, "00000000-0000-4000-8000-00000000085a")) + " COMMIT;", "42501");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    SELECT
      (SELECT count(*) FROM operational_authority_candidate.third_party_registration_events WHERE tenant_id='tenant-a' AND request_id='${thirdPartyRequestId}') || '|' ||
      (SELECT count(*) FROM operational_authority_candidate.case_registration_events WHERE tenant_id='tenant-a' AND request_id='${caseRequestId}') || '|' ||
      (SELECT count(*) FROM operational_authority_candidate.third_parties WHERE tenant_id='tenant-a' AND cnpj='33333333333333') || '|' ||
      (SELECT count(*) FROM operational_authority_candidate.third_party_cases AS c
        JOIN operational_authority_candidate.case_registration_events AS e
          ON e.tenant_id=c.tenant_id AND e.workflow_id=c.id
       WHERE e.tenant_id='tenant-a' AND e.request_id='${caseRequestId}');
  `), "1|1|1|1");
  psql(`BEGIN; SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true);
    SELECT * FROM operational_authority_candidate.third_party_registration_events;`, "42501");
  psql(`BEGIN; SET LOCAL ROLE operational_authority_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true);
    SELECT * FROM operational_authority_candidate.case_registration_events;`, "42501");
  psql(`UPDATE operational_authority_candidate.third_party_registration_events
    SET review_rationale='histórico alterado' WHERE tenant_id='tenant-a';`, "P0001");
  psql(`TRUNCATE operational_authority_candidate.case_registration_events;`, "P0001");

  stage = "trusted invitation capture function";
  const invitationId = "invite-function";
  const invitationScope = "Manutenção fictícia";
  const canonicalTuple = [
    "sst-m22-legacy-invitation-context-v1", "third-party-json", "tenant-a", invitationId,
    "company-a", "unit-a", "11111111111111", invitationScope, ["PGR"],
  ];
  const contextDigest = createHash("sha256").update(JSON.stringify(canonicalTuple), "utf8").digest("hex");
  const captureArguments = `'${invitationId}','${contextDigest}','${contextDigest}','company-a','unit-a','11111111111111','${invitationScope}',ARRAY['PGR']`;
  psql(`
    BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$
    DECLARE first_capture record; retry_capture record;
    BEGIN
      SELECT * INTO first_capture FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(${captureArguments});
      IF first_capture.revision <> 1 OR first_capture.inserted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'first capture did not append revision 1';
      END IF;
      SELECT * INTO retry_capture FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(${captureArguments});
      IF retry_capture.snapshot_id IS DISTINCT FROM first_capture.snapshot_id
         OR retry_capture.revision <> 1 OR retry_capture.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'identical retry duplicated or changed the snapshot';
      END IF;
    END $$;
    COMMIT;
  `);
  const expectedFailure = (label, code, sql) => {
    try {
      psql(sql);
    } catch (error) {
      const stderr = String(error.stderr ?? error.message);
      assert.match(stderr, new RegExp(`(?:\\[${code}\\]|\\b${code}\\b)`), `${label}: esperava SQLSTATE ${code}: ${stderr}`);
      return;
    }
    assert.fail(`${label}: SQL command unexpectedly succeeded`);
  };
  expectedFailure("cliente cannot list consultancy case options", "42501", `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id='tenant-a';
    SET LOCAL sst.user_id='user-client-authority';
    SELECT * FROM third_party_legacy_reconciliation_candidate.list_consultancy_third_party_cases();
  `);
  const appCall = (tenantId, userId, args, webRole = userId === "user-client" ? "cliente" : "consultoria_admin") => `BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','${tenantId}',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${webRole}',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(${args});`;
  expectedFailure("capture rejects stale preview digest", "22023", appCall("tenant-a", "user-a", `'invite-function','${"0".repeat(64)}','${contextDigest}','company-a','unit-a','11111111111111','${invitationScope}',ARRAY['PGR']`));
  expectedFailure("capture rejects same digest with changed payload", "40001", appCall("tenant-a", "user-a", `'invite-function','${contextDigest}','${contextDigest}','company-a','unit-a','11111111111111','Escopo alterado',ARRAY['PGR']`));
  expectedFailure("capture rejects unsupported web role", "42501", appCall("tenant-a", "user-client", captureArguments));
  expectedFailure("capture rejects role drift between web and database", "42501", appCall("tenant-a", "user-a", captureArguments, "sst_tst"));
  expectedFailure("capture rejects suspended membership", "42501", appCall("tenant-a", "user-suspended", captureArguments));
  expectedFailure("capture rejects mismatched tenant and actor", "42501", appCall("tenant-a", "user-b", captureArguments));
  expectedFailure("capture rejects missing server context", "42501", `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(${captureArguments});`);
  expectedFailure("app cannot read invitation snapshots directly", "42501", `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT * FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots;`);
  expectedFailure("app cannot insert invitation snapshots directly", "42501", `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    INSERT INTO third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots(tenant_id,source_store,source_invitation_id,revision,requested_categories,context_sha256,captured_by)
    VALUES ('tenant-a','third-party-json','direct-write',1,ARRAY['PGR'],'${contextDigest}','user-a');`);

  stage = "concurrent invitation capture";
  const raceInvitationId = "invite-race";
  const raceDigest = createHash("sha256").update(JSON.stringify([
    "sst-m22-legacy-invitation-context-v1", "third-party-json", "tenant-a", raceInvitationId,
    "company-a", "unit-a", "11111111111111", invitationScope, ["PGR"],
  ]), "utf8").digest("hex");
  const raceArguments = `'${raceInvitationId}','${raceDigest}','${raceDigest}','company-a','unit-a','11111111111111','${invitationScope}',ARRAY['PGR']`;
  const dockerPsqlArgs = ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", "sst_hoje_dev"];
  const raceSql = `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT pg_advisory_xact_lock(hashtextextended('m22-invitation-context:tenant-a:third-party-json:${raceInvitationId}',0));
    SELECT pg_sleep(1.0);
    SELECT * FROM third_party_legacy_reconciliation_candidate.capture_invitation_context(${raceArguments}); COMMIT;`;
  const firstRace = dockerAsync(dockerPsqlArgs, raceSql);
  await new Promise(done => setTimeout(done, 200));
  const secondRace = dockerAsync(dockerPsqlArgs, raceSql.replace("SELECT pg_sleep(1.0);", "SELECT pg_sleep(0.0);"));
  const [firstRaceOutput, secondRaceOutput] = await Promise.all([firstRace, secondRace]);
  assert.ok(firstRaceOutput.includes(`|1|${raceDigest}|t`), "primeira captura concorrente deve inserir revisão 1");
  assert.ok(secondRaceOutput.includes(`|1|${raceDigest}|f`), "segunda captura concorrente deve retornar o snapshot já inserido");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || max(revision) FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
      WHERE tenant_id='tenant-a' AND source_store='third-party-json' AND source_invitation_id='${raceInvitationId}';`), "1|1");

  stage = "trusted invitation case-link function";
  const invitationSnapshotId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT id FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
      WHERE tenant_id='tenant-a' AND source_invitation_id='${invitationId}' AND revision=1;`);
  const linkCall = (revision, state, rationale, target = true) => {
    const caseTarget = target
      ? `'company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a'`
      : `NULL,NULL,NULL,NULL`;
    return `'${invitationSnapshotId}','${contextDigest}',${revision},'${state}',${caseTarget},'${rationale}'`;
  };
  const appLinkCall = (tenantId, userId, args, webRole = userId.startsWith("user-client") ? "cliente" : "consultoria_admin") => `BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','${tenantId}',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${webRole}',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${args});`;
  psql(`
    BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$
    DECLARE first_event record; retry_event record; proposal_event record; proposal_retry record;
    BEGIN
      SELECT * INTO first_event FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(0, "pending", "Captura inicial fictícia", false)});
      IF first_event.revision <> 1 OR first_event.event_type <> 'pending' OR first_event.inserted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'initial pending event did not create revision 1';
      END IF;
      SELECT * INTO retry_event FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(0, "pending", "Captura inicial fictícia", false)});
      IF retry_event.event_id IS DISTINCT FROM first_event.event_id OR retry_event.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'identical pending retry created another event';
      END IF;
      SELECT * INTO proposal_event FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(1, "proposed", "Caso proposto para confirmação cliente")});
      IF proposal_event.revision <> 2 OR proposal_event.event_type <> 'proposed' OR proposal_event.inserted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'pending to proposed did not create revision 2';
      END IF;
      SELECT * INTO proposal_retry FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(1, "proposed", "Caso proposto para confirmação cliente")});
      IF proposal_retry.event_id IS DISTINCT FROM proposal_event.event_id OR proposal_retry.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'identical proposal retry created another event';
      END IF;
    END $$;
    COMMIT;
  `);
  const consultancyLinkState = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id='tenant-a';
    SET LOCAL sst.user_id='user-a';
    SELECT source_invitation_id || '|' || revision || '|' || event_type
      FROM third_party_legacy_reconciliation_candidate.list_consultancy_invitation_case_states(ARRAY['${invitationId}']::text[]);
    ROLLBACK;
  `);
  assert.equal(consultancyLinkState, `${invitationId}|2|proposed`,
    "a consultoria deve consultar o último estado do convite dentro do tenant");
  const clientVisibleProposalCount = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id='tenant-a';
    SET LOCAL sst.user_id='user-client-authority';
    SELECT count(*) || '|' || max(revision) || '|' || max(source_invitation_id)
      FROM third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals();
    ROLLBACK;
  `);
  assert.equal(clientVisibleProposalCount, `1|2|${invitationId}`,
    "o cliente designado deve ver a proposta exata somente no escopo de sua designação");
  const undesignatedProposalCount = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id='tenant-a';
    SET LOCAL sst.user_id='user-client';
    SELECT count(*) FROM third_party_legacy_reconciliation_candidate.list_client_registrar_invitation_proposals();
    ROLLBACK;
  `);
  assert.equal(undesignatedProposalCount, "0",
    "uma membership cliente sem designação não deve visualizar propostas");
  expectedFailure("consultancy cannot confirm its own case proposal", "42501", appLinkCall("tenant-a", "user-a", linkCall(2, "linked", "Confirmação indevida")));
  expectedFailure("non-designated client cannot confirm a case proposal", "42501", appLinkCall("tenant-a", "user-client", linkCall(2, "linked", "Confirmação sem designação")));
  expectedFailure("client confirmation cannot change the proposed exact case", "23514", appLinkCall(
    "tenant-a",
    "user-client-authority",
    `'${invitationSnapshotId}','${contextDigest}',2,'linked','company-a','unit-a','00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-00000000010b','Tentativa de alterar caso proposto'`,
  ));
  psql(`
    BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-client-authority',true), set_config('sst.membership_role','cliente',true);
    DO $$
    DECLARE linked_event record; linked_retry record;
    BEGIN
      SELECT * INTO linked_event FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(2, "linked", "Caso confirmado pelo representante cliente")});
      SELECT * INTO linked_retry FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(2, "linked", "Caso confirmado pelo representante cliente")});
      IF linked_event.revision <> 3 OR linked_event.event_type <> 'linked' OR linked_event.inserted IS DISTINCT FROM true
         OR linked_retry.event_id IS DISTINCT FROM linked_event.event_id OR linked_retry.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'client confirmation or identical retry failed';
      END IF;
    END $$;
    COMMIT;
  `);
  psql(`
    BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$
    DECLARE reopened_event record; relinked_proposal record;
    BEGIN
      SELECT * INTO reopened_event FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(3, "reopened", "Vínculo reaberto para revisão", false)});
      IF reopened_event.revision <> 4 OR reopened_event.event_type <> 'reopened' THEN
        RAISE EXCEPTION 'linked to reopened did not invalidate the current link';
      END IF;
      SELECT * INTO relinked_proposal FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(${linkCall(4, "proposed", "Nova proposta para confirmação cliente")});
      IF relinked_proposal.revision <> 5 OR relinked_proposal.event_type <> 'proposed' THEN
        RAISE EXCEPTION 'reopened to proposed did not create revision 5';
      END IF;
    END $$;
    COMMIT;
  `);
  expectedFailure("link function rejects web/database role drift", "42501", appLinkCall("tenant-a", "user-a", linkCall(5, "ambiguous", "Papel divergente", false), "sst_tst"));
  expectedFailure("link function rejects stale expected revision", "40001", appLinkCall("tenant-a", "user-a", linkCall(4, "ambiguous", "Revisão atrasada", false)));
  expectedFailure("link function rejects linked to pending transition", "23514", appLinkCall("tenant-a", "user-a", linkCall(5, "pending", "Transição inválida", false)));
  expectedFailure("non-designated client cannot confirm a case proposal", "42501", appLinkCall("tenant-a", "user-client", linkCall(5, "linked", "Confirmação sem designação")));
  psql(appLinkCall("tenant-a", "user-client-authority", linkCall(5, "linked", "Vínculo confirmado após nova revisão")) + " COMMIT;");
  psql(appLinkCall("tenant-a", "user-a", linkCall(6, "reopened", "Reabertura para testar alvo inexistente", false)) + " COMMIT;");
  expectedFailure("link function rejects nonexistent exact case proposal", "23503", appLinkCall("tenant-a", "user-a", `'${invitationSnapshotId}','${contextDigest}',7,'proposed','company-a','unit-a','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000099','Caso inexistente'`));
  const changedScope = "Escopo atualizado fictício";
  const changedDigest = createHash("sha256").update(JSON.stringify([
    "sst-m22-legacy-invitation-context-v1", "third-party-json", "tenant-a", invitationId,
    "company-a", "unit-a", "11111111111111", changedScope, ["PGR"],
  ]), "utf8").digest("hex");
  const changedCaptureArgs = `'${invitationId}','${changedDigest}','${changedDigest}','company-a','unit-a','11111111111111','${changedScope}',ARRAY['PGR']`;
  psql(appCall("tenant-a", "user-a", changedCaptureArgs) + " COMMIT;");
  expectedFailure("link function rejects superseded snapshot", "40001", appLinkCall("tenant-a", "user-a", linkCall(6, "pending", "Snapshot anterior", false)));
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT revision || '|' || event_type || '|' || (company_id IS NOT NULL)::text
       FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events
      WHERE tenant_id='tenant-a' AND source_invitation_id='${invitationId}'
      ORDER BY revision DESC LIMIT 1;`), "7|reopened|false");

  const revokedRegistrarInvitationId = "invite-revoked-registrar";
  const revokedRegistrarDigest = createHash("sha256").update(JSON.stringify([
    "sst-m22-legacy-invitation-context-v1", "third-party-json", "tenant-a", revokedRegistrarInvitationId,
    "company-a", "unit-a", "11111111111111", invitationScope, ["PGR"],
  ]), "utf8").digest("hex");
  const revokedRegistrarCapture = `'${revokedRegistrarInvitationId}','${revokedRegistrarDigest}','${revokedRegistrarDigest}','company-a','unit-a','11111111111111','${invitationScope}',ARRAY['PGR']`;
  psql(appCall("tenant-a", "user-a", revokedRegistrarCapture) + " COMMIT;");
  const revokedRegistrarSnapshotId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT id FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
      WHERE tenant_id='tenant-a' AND source_invitation_id='${revokedRegistrarInvitationId}' AND revision=1;`);
  const revokedRegistrarLinkCall = (revision, state, rationale, target = true) => {
    const caseTarget = target
      ? `'company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a'`
      : "NULL,NULL,NULL,NULL";
    return `'${revokedRegistrarSnapshotId}','${revokedRegistrarDigest}',${revision},'${state}',${caseTarget},'${rationale}'`;
  };
  psql(appLinkCall("tenant-a", "user-a", revokedRegistrarLinkCall(0, "pending", "Revisão inicial", false)) + " COMMIT;");
  psql(appLinkCall("tenant-a", "user-a", revokedRegistrarLinkCall(1, "proposed", "Caso exato proposto")) + " COMMIT;");
  expectedFailure("revoked client registrar cannot confirm a case proposal", "42501", appLinkCall(
    "tenant-a",
    "user-client-revoked",
    revokedRegistrarLinkCall(2, "linked", "Confirmação após revogação"),
  ));

  stage = "concurrent invitation case-link revision";
  const raceSnapshotId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT id FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
      WHERE tenant_id='tenant-a' AND source_invitation_id='${raceInvitationId}' AND revision=1;`);
  const linkRaceSql = rationale => `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT pg_advisory_xact_lock(hashtextextended('m22-invitation-context:tenant-a:third-party-json:${raceInvitationId}',0));
    SELECT pg_sleep(1.0);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(
      '${raceSnapshotId}','${raceDigest}',0,'pending',NULL,NULL,NULL,NULL,'${rationale}'); COMMIT;`;
  const firstLinkRace = dockerAsync(dockerPsqlArgs, linkRaceSql("Primeira revisão concorrente"));
  await new Promise(done => setTimeout(done, 200));
  const secondLinkRace = dockerAsync(dockerPsqlArgs, linkRaceSql("Revisão concorrente obsoleta").replace("SELECT pg_sleep(1.0);", "SELECT pg_sleep(0.0);"));
  const [firstLinkResult, secondLinkResult] = await Promise.allSettled([firstLinkRace, secondLinkRace]);
  assert.equal(firstLinkResult.status, "fulfilled", "uma transição concorrente deve vencer");
  assert.ok(firstLinkResult.value.includes("|1|pending|t"), "transição vencedora deve gravar revisão 1");
  assert.equal(secondLinkResult.status, "rejected", "transição concorrente obsoleta deve conflitar");
  const linkRaceError = `${secondLinkResult.reason?.stderr ?? ""}\n${secondLinkResult.reason?.stdout ?? ""}\n${secondLinkResult.reason ?? ""}`;
  assert.match(linkRaceError, /\b40001\b/, `transição concorrente obsoleta deve retornar conflito de revisão: ${linkRaceError}`);
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || max(revision) FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events
      WHERE tenant_id='tenant-a' AND source_invitation_id='${raceInvitationId}';`), "1|1");

  stage = "prepare receipt capture proof";
  const raceInvitationSnapshotId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT id FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots
      WHERE tenant_id='tenant-a' AND source_invitation_id='${raceInvitationId}' AND revision=1;`);
  const syntheticObjectId = sourceReceiptId => {
    const hash = createHash("sha256").update(sourceReceiptId).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  };
  const captureReceiptCall = (sourceReceiptId, replacesReceiptId = null, kind = "PGR", sha = "a".repeat(64), revision = 1, objectId = syntheticObjectId(sourceReceiptId)) =>
    `'${raceInvitationId}','${raceDigest}',${revision},'${sourceReceiptId}','${kind}','${sourceReceiptId}.pdf','${sha}',2048,'2026-10-20T12:00:00Z'::timestamptz,DATE '2027-12-31',${replacesReceiptId ? `'${replacesReceiptId}'` : "NULL"},'${objectId}','synthetic-private','tenant-a/${objectId}.pdf'`;
  const appCaptureReceiptCall = (args, userId = "user-a", webRole = "consultoria_admin") => `BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${webRole}',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.capture_legacy_receipt(${args});`;
  stage = "trusted legacy receipt capture function";
  const capturedReceiptId = "receipt-ingest-root";
  psql(`BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$ DECLARE first_capture record; retry_capture record; BEGIN
      SELECT * INTO first_capture FROM third_party_legacy_reconciliation_candidate.capture_legacy_receipt(${captureReceiptCall(capturedReceiptId)});
      SELECT * INTO retry_capture FROM third_party_legacy_reconciliation_candidate.capture_legacy_receipt(${captureReceiptCall(capturedReceiptId)});
      IF first_capture.inserted IS DISTINCT FROM true OR retry_capture.inserted IS DISTINCT FROM false
         OR retry_capture.legacy_receipt_id IS DISTINCT FROM first_capture.legacy_receipt_id THEN
        RAISE EXCEPTION 'receipt capture retry was not idempotent';
      END IF;
    END $$; COMMIT;`);
  stage = "local private storage and PostgreSQL registry integration";
  privateStorageRoot = await mkdtemp(resolve(tmpdir(), "sst-m22-private-db-proof-"));
  const privateStore = createLocalPrivateObjectStore(privateStorageRoot, Buffer.alloc(32, 41));
  const privateBytes = Buffer.from("%PDF-1.7\nsynthetic storage-to-postgres proof only\n", "utf8");
  const privateDigest = createHash("sha256").update(privateBytes).digest("hex");
  const privateReceipt = { tenantId: "tenant-a", receiptId: "receipt-storage-db-success", digest: privateDigest, size: privateBytes.byteLength };
  const privateCopy = await prepareLegacyReceiptPrivateObject({
    store: privateStore,
    receipt: privateReceipt,
    sourceBytes: privateBytes,
    idempotencyKey: "tenant-a:receipt-storage-db-success:copy-1",
  });
  const privateLocator = `tenant-a/${privateCopy.objectId}`;
  const privateReceiptArgs = `'${raceInvitationId}','${raceDigest}',1,'${privateReceipt.receiptId}','PGR','synthetic-proof.pdf','${privateCopy.digest}',${privateCopy.size},'2026-10-20T12:00:00Z'::timestamptz,DATE '2027-12-31',NULL,'${privateCopy.objectId}','local-filesystem-proof','${privateLocator}'`;
  psql(appCaptureReceiptCall(privateReceiptArgs) + " COMMIT;");
  const registeredOutput = docker(["exec", "-i", container, "psql", "-qAt", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"], `
    BEGIN;
    SET LOCAL ROLE sst_hoje_app;
    SET LOCAL sst.tenant_id = 'tenant-a';
    SET LOCAL sst.user_id = 'user-a';
    SET LOCAL sst.membership_role = 'consultoria_admin';
    SELECT tenant_id,object_id FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects();
    COMMIT;
  `);
  const registryRows = registeredOutput.split(/\r?\n/).filter(Boolean).map(line => {
    const [tenant_id, object_id] = line.split("|");
    return { tenant_id, object_id };
  });
  const registrySnapshot = await readRegisteredPrivateObjectSnapshot({
    async query(statement, values) {
      assert.match(statement, /list_registered_private_file_objects\(\) ORDER BY object_id$/);
      assert.deepEqual(values, []);
      return { rows: registryRows };
    },
  }, "tenant-a");
  const firstRecoveryPlan = await privateStore.planRecovery({
    registrySnapshot,
    minimumAgeMs: 0,
    now: new Date(Date.now() + 1000),
  });
  assert.equal(firstRecoveryPlan.scanned, 1);
  assert.equal(firstRecoveryPlan.blocked, 0);
  assert.deepEqual(firstRecoveryPlan.candidates, []);
  assert.deepEqual((await privateStore.read({ tenantId: "tenant-a", objectId: privateCopy.objectId })).bytes, privateBytes);

  const orphanReceipt = { ...privateReceipt, receiptId: "receipt-storage-db-orphan" };
  const orphanCopy = await prepareLegacyReceiptPrivateObject({
    store: privateStore,
    receipt: orphanReceipt,
    sourceBytes: privateBytes,
    idempotencyKey: "tenant-a:receipt-storage-db-orphan:copy-1",
  });
  const orphanArgs = `'${raceInvitationId}','${"0".repeat(64)}',1,'${orphanReceipt.receiptId}','PGR','synthetic-proof.pdf','${orphanCopy.digest}',${orphanCopy.size},'2026-10-20T12:00:00Z'::timestamptz,DATE '2027-12-31',NULL,'${orphanCopy.objectId}','local-filesystem-proof','tenant-a/${orphanCopy.objectId}'`;
  expectedFailure("database rejects stale invitation context after private copy", "40001", appCaptureReceiptCall(orphanArgs));
  const recoveryAfterFailure = await privateStore.planRecovery({
    registrySnapshot,
    minimumAgeMs: 0,
    now: new Date(Date.now() + 1000),
  });
  assert.equal(recoveryAfterFailure.scanned, 2);
  assert.equal(recoveryAfterFailure.blocked, 0);
  assert.deepEqual(recoveryAfterFailure.candidates.map(candidate => candidate.objectId), [orphanCopy.objectId]);
  assert.equal((await privateStore.read({ tenantId: "tenant-a", objectId: orphanCopy.objectId })).object.state, "verified");

  psql(appCaptureReceiptCall(captureReceiptCall("receipt-ingest-successor", capturedReceiptId, "PGR", "c".repeat(64))) + " COMMIT;");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || max(source_replaces_receipt_id) || '|' || max(source_valid_until::text)
       FROM third_party_legacy_reconciliation_candidate.legacy_receipts
      WHERE tenant_id='tenant-a' AND source_invitation_id='${raceInvitationId}'
        AND source_receipt_id IN ('${capturedReceiptId}','receipt-ingest-successor');`), "2|receipt-ingest-root|2027-12-31");
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || count(*) FILTER (WHERE e.event_type='verified') || '|' || count(*) FILTER (WHERE h.object_id IS NOT NULL)
       FROM third_party_legacy_reconciliation_candidate.legacy_receipts AS r
       JOIN third_party_evidence_candidate.private_file_objects AS o ON o.tenant_id=r.tenant_id AND o.id=r.private_file_object_id
       JOIN third_party_evidence_candidate.private_file_object_event_heads AS h ON h.tenant_id=o.tenant_id AND h.object_id=o.id
       JOIN third_party_evidence_candidate.private_file_object_events AS e ON e.tenant_id=h.tenant_id AND e.id=h.event_id AND e.object_id=h.object_id
      WHERE r.tenant_id='tenant-a' AND r.source_invitation_id='${raceInvitationId}'
        AND r.source_receipt_id IN ('${capturedReceiptId}','receipt-ingest-successor');`), "2|2|2");
  expectedFailure("receipt capture rejects unrequested category", "23514", appCaptureReceiptCall(captureReceiptCall("receipt-ingest-category", null, "PCMSO")));
  expectedFailure("receipt capture rejects stale invitation snapshot", "40001", appCaptureReceiptCall(captureReceiptCall("receipt-ingest-stale", null, "PGR", "a".repeat(64), 2)));
  expectedFailure("receipt capture rejects role drift", "42501", appCaptureReceiptCall(captureReceiptCall("receipt-ingest-role"), "user-a", "sst_tst"));
  expectedFailure("receipt capture rejects changed metadata for an existing source ID", "40001", appCaptureReceiptCall(captureReceiptCall(capturedReceiptId, null, "PGR", "d".repeat(64))));
  expectedFailure("receipt capture rejects an HTTP URL as private locator", "22023", appCaptureReceiptCall(
    `'${raceInvitationId}','${raceDigest}',1,'receipt-ingest-url','PGR','receipt-ingest-url.pdf','${"a".repeat(64)}',2048,'2026-10-20T12:00:00Z'::timestamptz,DATE '2027-12-31',NULL,'${syntheticObjectId("receipt-ingest-url")}','synthetic-private','https://example.invalid/file.pdf'`));

  stage = "trusted receipt reconciliation function";
  psql(`BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(
      '${raceInvitationSnapshotId}','${raceDigest}',1,'proposed','company-a','unit-a',
      '00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','Caso proposto para prova de recibo');
    COMMIT;
    BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-client-authority',true), set_config('sst.membership_role','cliente',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_invitation_case_link(
      '${raceInvitationSnapshotId}','${raceDigest}',2,'linked','company-a','unit-a',
      '00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','Confirmação cliente para prova de recibo');
    COMMIT;
    INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,imported_by
    ) VALUES ('tenant-a','00000000-0000-4000-8000-00000000060d','third-party-json','${raceInvitationId}',
      'receipt-functions','PGR','pgr-sintetico.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'user-a');
  `);
  const receiptFunctionCall = (revision, state, rationale, documentVersionId) => {
    if (documentVersionId === undefined) documentVersionId = state === "matched" ? "00000000-0000-4000-8000-00000000050a" : null;
    const versionId = documentVersionId ? `'${documentVersionId}'` : "NULL";
    return `'00000000-0000-4000-8000-00000000060d','${raceDigest}',${revision},'${state}',${versionId},'${rationale}'`;
  };
  const appReceiptCall = (tenantId, userId, args, webRole = userId.startsWith("user-client") ? "cliente" : "consultoria_admin") => `BEGIN;
    SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','${tenantId}',true), set_config('sst.user_id','${userId}',true), set_config('sst.membership_role','${webRole}',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${args});`;
  const receiptCall = (id, revision, state, rationale, documentVersionId = state === "matched" ? "00000000-0000-4000-8000-00000000050a" : null, expectedContextDigest = raceDigest) => {
    const versionId = documentVersionId ? `'${documentVersionId}'` : "NULL";
    return `'${id}','${expectedContextDigest}',${revision},'${state}',${versionId},'${rationale}'`;
  };

  stage = "legacy replacement chain validation";
  psql(`INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,source_replaces_receipt_id,imported_by
    ) VALUES
      ('tenant-a','00000000-0000-4000-8000-000000000610','third-party-json','${raceInvitationId}','chain-root','PGR','root.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '2 seconds',NULL,'user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000611','third-party-json','${raceInvitationId}','chain-middle','PGR','middle.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '1 second','chain-root','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000612','third-party-json','${raceInvitationId}','chain-current','PGR','current.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'chain-middle','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000613','third-party-json','${raceInvitationId}','fork-root','PGR','fork-root.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '2 seconds',NULL,'user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000614','third-party-json','${raceInvitationId}','fork-current','PGR','fork-current.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'fork-root','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000615','third-party-json','${raceInvitationId}','fork-other','PGR','fork-other.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()+interval '1 second','fork-root','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000616','third-party-json','${raceInvitationId}','cycle-a','PGR','cycle-a.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()+interval '2 seconds','cycle-b','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000617','third-party-json','${raceInvitationId}','cycle-b','PGR','cycle-b.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()+interval '1 second','cycle-a','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000618','third-party-json','${raceInvitationId}','missing-parent','PGR','missing.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'not-imported','user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000619','third-party-json','${raceInvitationId}','late-parent','PGR','late.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()+interval '2 seconds',NULL,'user-a'),
      ('tenant-a','00000000-0000-4000-8000-00000000061a','third-party-json','${raceInvitationId}','early-child','PGR','early.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'late-parent','user-a'),
      ('tenant-a','00000000-0000-4000-8000-00000000061b','third-party-json','${raceInvitationId}','ambiguous-current','PGR','ambiguous.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'duplicate-parent','user-a'),
      ('tenant-a','00000000-0000-4000-8000-00000000061c','third-party-json','${raceInvitationId}','duplicate-parent','PGR','duplicate-a.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '1 second',NULL,'user-a'),
      ('tenant-a','00000000-0000-4000-8000-00000000061d','third-party-json','invite-duplicate','duplicate-parent','PGR','duplicate-b.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '1 second',NULL,'user-a');
  `);
  psql(`BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptCall("00000000-0000-4000-8000-000000000612", 0, "pending", "Cadeia sintética pendente", null)});
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptCall("00000000-0000-4000-8000-000000000612", 1, "matched", "Cadeia de três versões validada")}); COMMIT;`);
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || max(revision) FROM third_party_legacy_reconciliation_candidate.reconciliation_events WHERE tenant_id='tenant-a' AND legacy_receipt_id='00000000-0000-4000-8000-000000000612' AND event_type='matched';`), "1|2");

  const crossInvitationId = "invite-chain-cross";
  const crossInvitationDigest = createHash("sha256").update(JSON.stringify([
    "sst-m22-legacy-invitation-context-v1", "third-party-json", "tenant-a", crossInvitationId,
    "company-a", "unit-a", "11111111111111", invitationScope, ["PGR"],
  ]), "utf8").digest("hex");
  const crossInvitationArguments = `'${crossInvitationId}','${crossInvitationDigest}','${crossInvitationDigest}','company-a','unit-a','11111111111111','${invitationScope}',ARRAY['PGR']`;
  psql(appCall("tenant-a", "user-a", crossInvitationArguments) + " COMMIT;");
  const crossInvitationSnapshotId = docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT id FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots WHERE tenant_id='tenant-a' AND source_invitation_id='${crossInvitationId}' AND revision=1;`);
  const crossInvitationLinkCall = (revision, state, rationale, target = true) => {
    const caseTarget = target
      ? `'company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a'`
      : `NULL,NULL,NULL,NULL`;
    return `'${crossInvitationSnapshotId}','${crossInvitationDigest}',${revision},'${state}',${caseTarget},'${rationale}'`;
  };
  psql(appLinkCall("tenant-a", "user-a", crossInvitationLinkCall(0, "pending", "Convite alternativo capturado", false)) + " COMMIT;");
  psql(appLinkCall("tenant-a", "user-a", crossInvitationLinkCall(1, "proposed", "Mesmo caso proposto para confirmação")) + " COMMIT;");
  psql(appLinkCall("tenant-a", "user-client-authority", crossInvitationLinkCall(2, "linked", "Mesmo caso confirmado no convite alternativo")) + " COMMIT;");
  psql(`INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,source_replaces_receipt_id,imported_by
    ) VALUES
      ('tenant-a','00000000-0000-4000-8000-00000000061f','third-party-json','${raceInvitationId}','cross-root','PGR','cross-root.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '2 seconds',NULL,'user-a'),
      ('tenant-a','00000000-0000-4000-8000-000000000620','third-party-json','${crossInvitationId}','cross-current','PGR','cross-current.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()-interval '1 second','cross-root','user-a');
    INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(tenant_id,legacy_receipt_id,source_kind,revision,event_type,rationale,actor_user_id)
      VALUES ('tenant-a','00000000-0000-4000-8000-000000000620','PGR',1,'pending','Convite alternativo aguardando revisão','user-a');`);
  psql(`BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptCall("00000000-0000-4000-8000-000000000620", 1, "matched", "Cadeia entre convites confirmada", undefined, crossInvitationDigest)}); COMMIT;`);
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT event_type || '|' || (invitation_case_link_event_id IS NOT NULL)::text FROM third_party_legacy_reconciliation_candidate.reconciliation_events WHERE tenant_id='tenant-a' AND legacy_receipt_id='00000000-0000-4000-8000-000000000620' AND revision=2;`), "matched|true");

  for (const [label, id, code] of [
    ["fork", "00000000-0000-4000-8000-000000000614", "23514"],
    ["cycle", "00000000-0000-4000-8000-000000000616", "23514"],
    ["missing predecessor", "00000000-0000-4000-8000-000000000618", "40001"],
    ["non-monotonic replacement time", "00000000-0000-4000-8000-00000000061a", "23514"],
    ["ambiguous predecessor ID", "00000000-0000-4000-8000-00000000061b", "40001"],
  ]) {
    psql(`INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(
        tenant_id,legacy_receipt_id,source_kind,revision,event_type,rationale,actor_user_id
      ) VALUES ('tenant-a','${id}','PGR',1,'pending','Aguardando prova de cadeia','user-a');`);
    const failureArgs = receiptCall(id, 1, "matched", `Cadeia ${label}`);
    expectedFailure(`receipt match rejects replacement ${label}`, code, appReceiptCall("tenant-a", "user-a", failureArgs));
  }
  expectedFailure("an older receipt cannot be marked current", "23514", appReceiptCall("tenant-a", "user-a", receiptCall("00000000-0000-4000-8000-000000000610", 0, "matched", "Recibo raiz já substituído")));
  psql(`INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,source_replaces_receipt_id,imported_by
    ) VALUES ('tenant-a','00000000-0000-4000-8000-00000000061e','third-party-json','${raceInvitationId}',
      'chain-later','PGR','later.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now()+interval '1 second','chain-current','user-a');`);
  expectedFailure("an idempotent matched retry is invalidated by a later replacement", "23514", appReceiptCall("tenant-a", "user-a", receiptCall("00000000-0000-4000-8000-000000000612", 1, "matched", "Cadeia de três versões validada")));

  psql(`BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$ DECLARE first_event record; retry_event record; matched_event record; matched_retry record;
      reopened_event record; rematched_event record;
    BEGIN
      SELECT * INTO first_event FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(0, "pending", "Recibo aguardando revisão")});
      IF first_event.revision <> 1 OR first_event.event_type <> 'pending' OR first_event.inserted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'receipt pending did not create revision 1'; END IF;
      SELECT * INTO retry_event FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(0, "pending", "Recibo aguardando revisão")});
      IF retry_event.event_id IS DISTINCT FROM first_event.event_id OR retry_event.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'identical receipt pending retry created another event'; END IF;
      SELECT * INTO matched_event FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(1, "matched", "Recibo e objeto verificados")});
      IF matched_event.revision <> 2 OR matched_event.event_type <> 'matched' OR matched_event.inserted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'receipt match did not create revision 2'; END IF;
      SELECT * INTO matched_retry FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(1, "matched", "Recibo e objeto verificados")});
      IF matched_retry.event_id IS DISTINCT FROM matched_event.event_id OR matched_retry.inserted IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'identical matched retry created another event'; END IF;
      SELECT * INTO reopened_event FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(2, "reopened", "Reabrir para nova conferência", null)});
      IF reopened_event.revision <> 3 OR reopened_event.event_type <> 'reopened' THEN
        RAISE EXCEPTION 'matched to reopened did not invalidate current reconciliation'; END IF;
      SELECT * INTO rematched_event FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(${receiptFunctionCall(3, "matched", "Conferência repetida concluída")});
      IF rematched_event.revision <> 4 OR rematched_event.event_type <> 'matched' THEN
        RAISE EXCEPTION 'reopened to matched did not create revision 4'; END IF;
    END $$; COMMIT;
  `);
  expectedFailure("receipt function rejects web/database role drift", "42501", appReceiptCall("tenant-a", "user-a", receiptFunctionCall(3, "ambiguous", "Papel divergente", null), "sst_tst"));
  expectedFailure("receipt function rejects stale expected revision", "40001", appReceiptCall("tenant-a", "user-a", receiptFunctionCall(3, "ambiguous", "Revisão obsoleta", null)));
  expectedFailure("receipt function rejects illegal matched to pending transition", "23514", appReceiptCall("tenant-a", "user-a", receiptFunctionCall(4, "pending", "Transição inválida", null)));
  psql(appReceiptCall("tenant-a", "user-a", receiptFunctionCall(4, "reopened", "Reabrir para testar versão inválida", null)) + " COMMIT;");
  expectedFailure("receipt function rejects a version outside the verified target", "23503", appReceiptCall("tenant-a", "user-a", receiptFunctionCall(5, "matched", "Versão inexistente", "00000000-0000-4000-8000-000000000099")));
  psql(`INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,imported_by
    ) VALUES ('tenant-a','00000000-0000-4000-8000-00000000060e','third-party-json','${raceInvitationId}',
      'receipt-unsupported','Ficha de EPI','epi-sintetico.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'user-a');
    INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(
      tenant_id,legacy_receipt_id,source_kind,revision,event_type,rationale,actor_user_id
    ) VALUES ('tenant-a','00000000-0000-4000-8000-00000000060e','Ficha de EPI',1,'pending','Categoria fora do escopo','user-a');`);
  expectedFailure("receipt function rejects unsupported matched category", "23514", appReceiptCall("tenant-a", "user-a", `'00000000-0000-4000-8000-00000000060e','${raceDigest}',1,'matched','00000000-0000-4000-8000-00000000050a','Categoria sem alvo'`));

  stage = "concurrent receipt reconciliation revision";
  psql(`INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(
      tenant_id,id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,
      content_sha256,byte_size,source_received_at,imported_by
    ) VALUES ('tenant-a','00000000-0000-4000-8000-00000000060f','third-party-json','${raceInvitationId}',
      'receipt-race','PGR','pgr-concorrente.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'user-a');`);
  const receiptRaceCall = rationale => `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT pg_advisory_xact_lock(hashtextextended('m22-invitation-context:tenant-a:third-party-json:${raceInvitationId}',0));
    SELECT pg_sleep(1.0);
    SELECT * FROM third_party_legacy_reconciliation_candidate.record_receipt_reconciliation(
      '00000000-0000-4000-8000-00000000060f','${raceDigest}',0,'pending',NULL,'${rationale}'); COMMIT;`;
  const firstReceiptRace = dockerAsync(dockerPsqlArgs, receiptRaceCall("Primeira revisão concorrente"));
  await new Promise(done => setTimeout(done, 200));
  const secondReceiptRace = dockerAsync(dockerPsqlArgs, receiptRaceCall("Revisão concorrente obsoleta").replace("SELECT pg_sleep(1.0);", "SELECT pg_sleep(0.0);"));
  const [firstReceiptResult, secondReceiptResult] = await Promise.allSettled([firstReceiptRace, secondReceiptRace]);
  assert.equal(firstReceiptResult.status, "fulfilled", "uma revisão concorrente de recibo deve vencer");
  assert.ok(firstReceiptResult.value.includes("|1|pending|t"), "revisão vencedora deve criar o primeiro evento do recibo");
  assert.equal(secondReceiptResult.status, "rejected", "revisão concorrente obsoleta deve conflitar");
  const receiptRaceError = `${secondReceiptResult.reason?.stderr ?? ""}\n${secondReceiptResult.reason?.stdout ?? ""}\n${secondReceiptResult.reason ?? ""}`;
  assert.match(receiptRaceError, /\b40001\b/, `segunda revisão concorrente deve receber conflito: ${receiptRaceError}`);
  assert.equal(docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sst_hoje_dev"],
    `SELECT count(*) || '|' || max(revision) FROM third_party_legacy_reconciliation_candidate.reconciliation_events
      WHERE tenant_id='tenant-a' AND legacy_receipt_id='00000000-0000-4000-8000-00000000060f';`), "1|1");

  // The real app role may call only the tenant-checked reader, not read tables.
  stage = "candidate role privileges";
  for (const [label, sql] of [
    ["candidate SELECT", `SELECT * FROM third_party_evidence_candidate.private_file_objects;`],
    ["INSERT", `INSERT INTO third_party_evidence_candidate.private_file_objects(tenant_id,backend_code,object_locator,content_sha256,byte_size,registered_by) VALUES ('tenant-a','proof','direct-write','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'user-a');`],
    ["UPDATE", `UPDATE third_party_evidence_candidate.document_versions SET state='withdrawn';`],
    ["DELETE", `DELETE FROM third_party_evidence_candidate.document_versions;`],
    ["TRUNCATE", `TRUNCATE third_party_evidence_candidate.document_versions;`],
  ]) {
    try { psql(`BEGIN; SET LOCAL ROLE third_party_evidence_candidate_app; ${sql}`, "42501"); }
    catch (error) { throw new Error(`${label} should be denied to candidate app role: ${(error.stderr ?? error.message).toString()}`); }
  }
  psql(`BEGIN; SET LOCAL ROLE sst_hoje_app;
    SELECT * FROM third_party_evidence_candidate.private_file_objects;`, "42501");
  psql(`BEGIN; SET LOCAL ROLE sst_hoje_app;
    SELECT * FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects();`, "42501");

  stage = "tenant RLS through narrow registry reader";
  psql(`BEGIN; SET LOCAL ROLE sst_hoje_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','consultoria_admin',true);
    DO $$ BEGIN
      IF (SELECT count(*) FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects() WHERE tenant_id='tenant-a' AND object_id='00000000-0000-4000-8000-00000000020a') <> 1 THEN RAISE EXCEPTION 'tenant A did not see its fixture object'; END IF;
      IF EXISTS (SELECT 1 FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects() WHERE tenant_id='tenant-b') THEN RAISE EXCEPTION 'tenant B object visible from tenant A'; END IF;
    END $$; ROLLBACK;
  `);
  psql(`BEGIN; SET LOCAL ROLE sst_hoje_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-suspended',true), set_config('sst.membership_role','consultoria_admin',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects();`, "42501");
  psql(`BEGIN; SET LOCAL ROLE sst_hoje_app;
    SELECT set_config('sst.tenant_id','tenant-a',true), set_config('sst.user_id','user-a',true), set_config('sst.membership_role','sst_tst',true);
    SELECT * FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects();`, "42501");
  const invalids = [
    ["cross-company case unit", `INSERT INTO operational_authority_candidate.third_party_cases(tenant_id,company_id,unit_id,third_party_id,work_scope,created_by) VALUES ('tenant-a','company-a','unit-b','00000000-0000-4000-8000-00000000000a','escopo inválido','user-a');`, "23503"],
    ["file digest FK", `INSERT INTO third_party_evidence_candidate.document_versions(tenant_id,series_id,third_party_id,document_kind,revision,storage_object_id,file_name,content_sha256,byte_size,received_by,replaces_version_id,state) VALUES ('tenant-a','00000000-0000-4000-8000-00000000040a','00000000-0000-4000-8000-00000000000a','PGR',2,'00000000-0000-4000-8000-00000000020a','bad.pdf','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',10,'user-a','00000000-0000-4000-8000-00000000050a','superseded');`, "23503"],
    ["event head object binding", `INSERT INTO third_party_evidence_candidate.private_file_object_event_heads(tenant_id,object_id,event_id) VALUES ('tenant-a','00000000-0000-4000-8000-00000000020b','00000000-0000-4000-8000-00000000030a');`, "23503"],
    ["ASO source category", `INSERT INTO third_party_legacy_reconciliation_candidate.legacy_receipts(tenant_id,source_store,source_invitation_id,source_receipt_id,source_kind,source_file_name,content_sha256,byte_size,source_received_at,imported_by) VALUES ('tenant-a','third-party-json','invite-sintetico','aso-sintetico','ASO','aso.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',10,now(),'user-a');`, "23514"],
    ["incompatible legacy mapping", `INSERT INTO third_party_legacy_reconciliation_candidate.reconciliation_events(tenant_id,legacy_receipt_id,source_kind,revision,event_type,company_id,unit_id,third_party_id,workflow_id,document_series_id,document_version_id,target_document_kind,rationale,actor_user_id) VALUES ('tenant-a','00000000-0000-4000-8000-00000000060a','PGR',2,'matched','company-a','unit-a','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000010a','00000000-0000-4000-8000-00000000040a','00000000-0000-4000-8000-00000000050a','PCMSO','Mapeamento inválido','user-a');`, "23514"],
    ["item citation member absent from assessment snapshot", `INSERT INTO operational_authority_candidate.technical_assessment_item_sources(tenant_id,assessment_id,requirement_code,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint,reference_role) VALUES ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','documents','documents-snapshot-a',1,'pgr-version-missing',1,'1111111111111111111111111111111111111111111111111111111111111111','evidence');`, "23503"],
    ["item citation for nonexistent requirement", `INSERT INTO operational_authority_candidate.technical_assessment_item_sources(tenant_id,assessment_id,requirement_code,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint,reference_role) VALUES ('tenant-a','00000000-0000-4000-8000-00000000073a','UNKNOWN_CODE','documents','documents-snapshot-a',1,'pgr-version-a',1,'1111111111111111111111111111111111111111111111111111111111111111','evidence');`, "23503"],
    ["item citation role/source mismatch", `INSERT INTO operational_authority_candidate.technical_assessment_item_sources(tenant_id,assessment_id,requirement_code,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint,reference_role) VALUES ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','documents','documents-snapshot-a',1,'pgr-version-bad-role',1,'1111111111111111111111111111111111111111111111111111111111111111','criterion');`, "23514"],
    ["app direct DML", `BEGIN; SET LOCAL ROLE third_party_evidence_candidate_app; INSERT INTO third_party_evidence_candidate.private_file_objects(tenant_id,backend_code,object_locator,content_sha256,byte_size,registered_by) VALUES ('tenant-a','proof','direct-write','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'user-a');`, "42501"],
    ["authority app direct citation DML", `BEGIN; SET LOCAL ROLE operational_authority_candidate_app; INSERT INTO operational_authority_candidate.technical_assessment_item_sources(tenant_id,assessment_id,requirement_code,source_kind,snapshot_source_id,snapshot_source_revision,referenced_source_id,referenced_source_revision,referenced_source_fingerprint,reference_role) VALUES ('tenant-a','00000000-0000-4000-8000-00000000073a','PGR_PRESENT','documents','documents-snapshot-a',1,'direct-write',1,'1111111111111111111111111111111111111111111111111111111111111111','evidence');`, "42501"],
    ["legacy app direct invitation link DML", `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app; INSERT INTO third_party_legacy_reconciliation_candidate.invitation_case_link_events(tenant_id,source_store,source_invitation_id,snapshot_id,context_sha256,revision,event_type,rationale,actor_user_id) VALUES ('tenant-a','third-party-json','invite-sintetico','00000000-0000-4000-8000-00000000060b','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',2,'pending','Escrita direta inválida','user-a');`, "42501"],
    ["legacy app direct snapshot DML", `BEGIN; SET LOCAL ROLE third_party_legacy_reconciliation_candidate_app; INSERT INTO third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots(tenant_id,source_store,source_invitation_id,revision,requested_categories,context_sha256,captured_by) VALUES ('tenant-a','third-party-json','direct-write',1,ARRAY['PGR'],'${contextDigest}','user-a');`, "42501"],
  ];
  stage = "invalid FK, category, mapping, and app DML cases";
  for (const [label, sql, code] of invalids) {
    try { psql(sql, code); }
    catch (error) { throw new Error(`${label}: ${(error.stderr ?? error.message).toString()}`); }
  }

  stage = "append-only mutation cases";
  for (const [label, sql] of [
    ["object UPDATE", `UPDATE third_party_evidence_candidate.private_file_objects SET object_locator='changed' WHERE tenant_id='tenant-a';`],
    ["object DELETE", `DELETE FROM third_party_evidence_candidate.private_file_objects WHERE tenant_id='tenant-a';`],
    ["object TRUNCATE", `TRUNCATE third_party_evidence_candidate.private_file_objects CASCADE;`],
    ["object event UPDATE", `UPDATE third_party_evidence_candidate.private_file_object_events SET reason='changed' WHERE tenant_id='tenant-a';`],
    ["object event DELETE", `DELETE FROM third_party_evidence_candidate.private_file_object_events WHERE tenant_id='tenant-a';`],
    ["object event TRUNCATE", `TRUNCATE third_party_evidence_candidate.private_file_object_events CASCADE;`],
    ["receipt UPDATE", `UPDATE third_party_legacy_reconciliation_candidate.legacy_receipts SET source_file_name='changed' WHERE tenant_id='tenant-a';`],
    ["receipt DELETE", `DELETE FROM third_party_legacy_reconciliation_candidate.legacy_receipts WHERE tenant_id='tenant-a';`],
    ["receipt TRUNCATE", `TRUNCATE third_party_legacy_reconciliation_candidate.legacy_receipts CASCADE;`],
    ["reconciliation UPDATE", `UPDATE third_party_legacy_reconciliation_candidate.reconciliation_events SET rationale='changed' WHERE tenant_id='tenant-a';`],
    ["reconciliation DELETE", `DELETE FROM third_party_legacy_reconciliation_candidate.reconciliation_events WHERE tenant_id='tenant-a';`],
    ["reconciliation TRUNCATE", `TRUNCATE third_party_legacy_reconciliation_candidate.reconciliation_events;`],
    ["invitation snapshot UPDATE", `UPDATE third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots SET scope_text='changed' WHERE tenant_id='tenant-a';`],
    ["invitation snapshot DELETE", `DELETE FROM third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots WHERE tenant_id='tenant-a';`],
    ["invitation snapshot TRUNCATE", `TRUNCATE third_party_legacy_reconciliation_candidate.legacy_invitation_snapshots CASCADE;`],
    ["invitation case link UPDATE", `UPDATE third_party_legacy_reconciliation_candidate.invitation_case_link_events SET rationale='changed' WHERE tenant_id='tenant-a';`],
    ["invitation case link DELETE", `DELETE FROM third_party_legacy_reconciliation_candidate.invitation_case_link_events WHERE tenant_id='tenant-a';`],
    ["invitation case link TRUNCATE", `TRUNCATE third_party_legacy_reconciliation_candidate.invitation_case_link_events CASCADE;`],
    ["assessment item source UPDATE", `UPDATE operational_authority_candidate.technical_assessment_item_sources SET referenced_source_id='changed' WHERE tenant_id='tenant-a';`],
    ["assessment item source DELETE", `DELETE FROM operational_authority_candidate.technical_assessment_item_sources WHERE tenant_id='tenant-a';`],
    ["assessment item source TRUNCATE", `TRUNCATE operational_authority_candidate.technical_assessment_item_sources;`],
    ["assessment source member UPDATE", `UPDATE operational_authority_candidate.technical_assessment_source_members SET member_source_id='changed' WHERE tenant_id='tenant-a';`],
    ["assessment source member DELETE", `DELETE FROM operational_authority_candidate.technical_assessment_source_members WHERE tenant_id='tenant-a';`],
    ["assessment source member TRUNCATE", `TRUNCATE operational_authority_candidate.technical_assessment_source_members CASCADE;`],
  ]) {
    try { psql(sql, "P0001"); }
    catch (error) { throw new Error(`${label}: ${(error.stderr ?? error.message).toString()}`); }
  }

  console.log("M22 Etapas A + B selecionadas passaram: PostgreSQL 17, RLS/FKs, autorização e concorrência; cópia local privada sintética conciliada com registry PostgreSQL e plano de recuperação não destrutivo; reconciliação validou cadeia de três recibos e entre convites com escopo/caso iguais; fork, ciclo, predecessor ausente/ambíguo, ordem temporal e retry substituído foram negados; append-only e isolamento de tenant passaram.");
} catch (error) {
  const detail = String(error.stderr ?? error.message ?? error).replaceAll(password, "[redigido]").replaceAll(container, "[container descartável]");
  console.error(`M22 Stage A funcional falhou em ${stage}: ${detail.trim()}`);
  process.exitCode = 1;
} finally {
  if (privateStorageRoot) await rm(privateStorageRoot, { recursive: true, force: true });
  if (started) {
    try { docker(["rm", "--force", container]); }
    catch (error) { console.error(`Falha ao remover container descartável: ${String(error.stderr ?? error.message).replaceAll(container, "[container descartável]")}`); process.exitCode = 1; }
  }
}
