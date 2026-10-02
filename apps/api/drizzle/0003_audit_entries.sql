-- =============================================================================
-- 0003 — Durable, append-only business audit trail
-- =============================================================================
-- Audit data is deliberately separate from operational logs. It records business
-- mutations with an actor and correlation id and rejects in-place edits/deletes at the
-- database boundary. Retention/archival policy remains an infrastructure decision.
-- =============================================================================

CREATE TABLE audit_entries (
  id              uuid        PRIMARY KEY,
  resource_type   text        NOT NULL,
  resource_id     text        NOT NULL,
  action          text        NOT NULL,
  actor_id        text,
  source          text        NOT NULL,
  correlation_id  text        NOT NULL,
  occurred_at     timestamptz NOT NULL,
  changes         jsonb       NOT NULL,

  CONSTRAINT audit_entries_resource_type_not_blank CHECK (length(btrim(resource_type)) > 0),
  CONSTRAINT audit_entries_resource_id_not_blank CHECK (length(btrim(resource_id)) > 0),
  CONSTRAINT audit_entries_source_not_blank CHECK (length(btrim(source)) > 0),
  CONSTRAINT audit_entries_correlation_id_not_blank CHECK (length(btrim(correlation_id)) > 0),
  CONSTRAINT audit_entries_action_allowed CHECK (
    action IN ('created', 'updated', 'deleted', 'published', 'imported', 'ai_generated')
  ),
  CONSTRAINT audit_entries_changes_object CHECK (jsonb_typeof(changes) = 'object')
);

CREATE INDEX audit_entries_resource_idx
  ON audit_entries (resource_type, resource_id, occurred_at DESC);
CREATE INDEX audit_entries_actor_idx
  ON audit_entries (actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX audit_entries_correlation_idx ON audit_entries (correlation_id);
CREATE INDEX audit_entries_occurred_at_idx ON audit_entries (occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_entry_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_entries_append_only
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();
