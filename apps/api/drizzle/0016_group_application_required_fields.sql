-- New and updated application records follow the approved compatibility template.
-- NOT VALID preserves legacy rows so they can be corrected through the audited UI,
-- while PostgreSQL enforces the rule for every subsequent INSERT/UPDATE.
ALTER TABLE group_applications
  ADD CONSTRAINT group_applications_required_fields
  CHECK (
    vehicle_type IN ('AUTOMOTRIZ', 'INDUSTRIAL') AND
    make IS NOT NULL AND btrim(make) <> '' AND
    model IS NOT NULL AND btrim(model) <> ''
  ) NOT VALID;
