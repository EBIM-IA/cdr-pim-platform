-- =============================================================================
-- 0009 — Template-controlled technical-sheet inclusion
-- =============================================================================
-- Excluding an attribute never deletes its definition or values. This flag controls only
-- whether a template exposes it to the future category PDF/technical sheet.

ALTER TABLE template_attribute_assignments
  ADD COLUMN include_in_technical_sheet boolean NOT NULL DEFAULT false;
