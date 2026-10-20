-- =============================================================================
-- 0012 — Preserve optimistic-concurrency tokens when an attribute is cleared
-- =============================================================================
-- A physical DELETE made the next value start at version 1 again. That allowed an old
-- version-1 command to succeed after a delete/recreate cycle (the ABA problem). A cleared
-- value is now retained as a tombstone with the next version and no typed payload.

ALTER TABLE product_attribute_values
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE product_attribute_values
  DROP CONSTRAINT product_attribute_values_one_typed_value;

ALTER TABLE product_attribute_values
  ADD CONSTRAINT product_attribute_values_one_typed_value CHECK (
    (deleted_at IS NULL
      AND num_nonnulls(value_text, value_number, value_boolean, value_date, value_json) = 1)
    OR
    (deleted_at IS NOT NULL
      AND num_nonnulls(value_text, value_number, value_boolean, value_date, value_json) = 0)
  );
