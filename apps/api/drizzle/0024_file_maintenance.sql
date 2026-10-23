-- Durable reconciliation observes unreferenced objects for 30 days before physical
-- purge. Recoverable catalog references are protected regardless of deletion state.
-- Rollback before use: DROP TABLE file_cleanup_candidates, file_inventory_cursors, file_maintenance_leases;
CREATE TABLE file_cleanup_candidates (
 id uuid PRIMARY KEY, bucket text NOT NULL, object_key text NOT NULL, identity text NOT NULL,
 version_id text, etag text, modified_at timestamptz NOT NULL, size bigint NOT NULL,
 delete_marker boolean NOT NULL, first_unreferenced_at timestamptz, last_observed_at timestamptz NOT NULL,
 status text NOT NULL, attempts integer NOT NULL DEFAULT 0, last_attempt_at timestamptz, completed_at timestamptz,
 CONSTRAINT file_cleanup_candidates_status_check CHECK (status IN ('pending','protected','deleted')),
 CONSTRAINT file_cleanup_candidates_size_check CHECK (size >= 0),
 CONSTRAINT file_cleanup_candidates_attempts_check CHECK (attempts >= 0),
 CONSTRAINT file_cleanup_candidates_pending_check CHECK (status <> 'pending' OR first_unreferenced_at IS NOT NULL),
 CONSTRAINT file_cleanup_candidates_completed_check CHECK ((status = 'deleted') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX file_cleanup_candidates_identity_key ON file_cleanup_candidates(bucket, object_key, identity);
CREATE INDEX file_cleanup_candidates_due_idx ON file_cleanup_candidates(status, first_unreferenced_at, id);
CREATE TABLE file_inventory_cursors (namespace text PRIMARY KEY, cursor text, updated_at timestamptz NOT NULL);
CREATE TABLE file_maintenance_leases (name text PRIMARY KEY, token uuid NOT NULL, expires_at timestamptz NOT NULL);
