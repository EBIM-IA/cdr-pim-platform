-- Preserve compatibility records while requiring explicit verification before consultation.
-- Existing records stay visible to administrators and are not silently marked verified.
ALTER TABLE group_applications ADD COLUMN verification_status text NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified'));
-- Reverse (manual): ALTER TABLE group_applications DROP COLUMN verification_status;
