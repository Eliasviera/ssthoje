-- Global landing CMS pilot. JSON remains the active source until an explicit cutover.
CREATE TABLE sst.site_cms_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  draft_revision integer NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  draft_content jsonb NOT NULL,
  published_revision integer,
  published_content jsonb,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((published_revision IS NULL) = (published_content IS NULL)),
  CHECK (published_revision IS NULL OR published_revision >= 0)
);

CREATE TABLE sst.site_cms_history (
  id uuid PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('save', 'publish')),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 600),
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  CHECK (
    (operation = 'save' AND before_snapshot IS NOT NULL)
    OR (operation = 'publish')
  )
);

CREATE INDEX site_cms_history_occurred_at_idx
  ON sst.site_cms_history (occurred_at, id);

CREATE FUNCTION sst.reject_site_cms_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'site CMS history is append-only' USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER site_cms_history_no_update_delete
  BEFORE UPDATE OR DELETE ON sst.site_cms_history
  FOR EACH ROW EXECUTE FUNCTION sst.reject_site_cms_history_mutation();

-- No runtime grants here. The current application role stays read-only until
-- the transactional store and audit write path are implemented and reviewed.
