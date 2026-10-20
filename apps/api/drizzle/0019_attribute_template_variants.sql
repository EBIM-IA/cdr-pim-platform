-- A workbook category can have more than one independently versioned template (for example
-- 22.1 and 22.2). Existing rows predate workbook variant identities, so keep them as the
-- explicit legacy variant instead of guessing a sheet number.
ALTER TABLE attribute_templates
  ADD COLUMN variant_key text NOT NULL DEFAULT 'legacy';

ALTER TABLE attribute_templates
  ADD CONSTRAINT attribute_templates_variant_key_not_blank
  CHECK (length(btrim(variant_key)) > 0);

ALTER TABLE attribute_templates
  ALTER COLUMN variant_key DROP DEFAULT;

DROP INDEX attribute_templates_category_version_key;
DROP INDEX attribute_templates_one_active_per_category;

CREATE UNIQUE INDEX attribute_templates_category_variant_version_key
  ON attribute_templates (category_id, variant_key, version);

CREATE UNIQUE INDEX attribute_templates_one_active_per_category_variant
  ON attribute_templates (category_id, variant_key)
  WHERE status = 'active';
