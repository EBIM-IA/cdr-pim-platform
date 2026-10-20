-- Allow durable previews and confirmations for OEM codes. The original constraint was
-- intentionally closed; extend it in a new migration because applied migrations are immutable.

ALTER TABLE import_batches
  DROP CONSTRAINT import_batches_target_allowed;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_target_allowed
  CHECK (target IN ('category', 'applications', 'homologs', 'oem'));
