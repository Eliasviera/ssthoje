-- Preserve each explicit PT/PTE draft save as an immutable tenant-scoped snapshot.
ALTER TABLE sst.work_permit_drafts
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE sst.work_permit_draft_revisions (
  tenant_id text NOT NULL,
  draft_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, draft_id, revision),
  FOREIGN KEY (tenant_id, draft_id)
    REFERENCES sst.work_permit_drafts (tenant_id, id) ON DELETE RESTRICT
);

INSERT INTO sst.work_permit_draft_revisions (tenant_id, draft_id, revision, snapshot, actor_user_id, occurred_at)
SELECT tenant_id, id, revision,
       jsonb_build_object('mapId', map_id, 'aprId', apr_id, 'title', title, 'values', field_values, 'status', status),
       COALESCE(updated_by, created_by), COALESCE(updated_at, created_at)
FROM sst.work_permit_drafts;

CREATE INDEX work_permit_draft_revisions_tenant_record_idx
  ON sst.work_permit_draft_revisions (tenant_id, draft_id, revision DESC);

CREATE FUNCTION sst.reject_work_permit_draft_revision_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'work permit draft revisions are append-only' USING ERRCODE = '55000';
END
$function$;
CREATE TRIGGER work_permit_draft_revisions_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.work_permit_draft_revisions
  FOR EACH ROW EXECUTE FUNCTION sst.reject_work_permit_draft_revision_mutation();

ALTER TABLE sst.work_permit_draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst.work_permit_draft_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY work_permit_draft_revisions_current_tenant ON sst.work_permit_draft_revisions
  USING (tenant_id = current_setting('sst.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('sst.tenant_id', true));

GRANT SELECT, INSERT ON sst.work_permit_draft_revisions TO sst_hoje_app;
