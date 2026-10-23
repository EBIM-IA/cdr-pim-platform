-- Publication selection belongs to each template assignment. Existing assignments retain
-- their visible behavior; selecting channel fields is independent of PDF export policy.
-- Reversible before operational use with: ALTER TABLE template_attribute_assignments DROP COLUMN publishable;
ALTER TABLE template_attribute_assignments
  ADD COLUMN publishable boolean NOT NULL DEFAULT true;
