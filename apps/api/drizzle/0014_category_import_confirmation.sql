-- Safe category imports keep their optimistic-lock plan server-side and claim a batch before
-- confirmation so two HTTP requests cannot apply the same staged rows concurrently.
ALTER TABLE import_batches
  DROP CONSTRAINT import_batches_status_allowed;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_status_allowed
  CHECK (status IN ('previewed', 'processing', 'confirmed', 'failed'));

ALTER TABLE import_rows
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE import_rows
  ADD CONSTRAINT import_rows_metadata_object CHECK (jsonb_typeof(metadata) = 'object');

ALTER TABLE import_batches
  ADD COLUMN processing_started_at timestamptz;

CREATE INDEX import_batches_processing_lease_idx
  ON import_batches (status, processing_started_at)
  WHERE status = 'processing';
