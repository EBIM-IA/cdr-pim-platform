-- The API owns a durable local confirmation queue. A unique batch key makes repeated
-- enqueue requests converge; leases let another API process recover after a restart.
CREATE TABLE import_executions (
 batch_id uuid PRIMARY KEY REFERENCES import_batches(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
 actor jsonb NOT NULL,
 processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
 total_rows integer NOT NULL CHECK (total_rows >= 0),
 queued_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 lease_until timestamptz,
 lease_token uuid,
 error text
);
CREATE INDEX import_executions_pending_idx ON import_executions(status, lease_until, queued_at);
-- Reverse: drain pending tasks and preserve their audit before dropping import_executions.
