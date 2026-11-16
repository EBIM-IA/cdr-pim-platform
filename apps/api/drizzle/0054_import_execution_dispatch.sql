-- Track reliable dispatch to SQS separately from execution. PostgreSQL is an outbox
-- and progress store; IMPORT_BATCH work is performed only by the SQS worker (ADR-006).
ALTER TABLE import_executions ADD COLUMN dispatched_at timestamptz;
CREATE INDEX import_executions_dispatch_idx ON import_executions(queued_at) WHERE dispatched_at IS NULL AND status='queued';
-- Reverse: DROP INDEX import_executions_dispatch_idx; ALTER TABLE import_executions DROP COLUMN dispatched_at;
