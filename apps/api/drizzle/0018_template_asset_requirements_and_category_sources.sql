-- Workbook-backed catalogue metadata that was previously present only in the generated manifest.
-- Requirements describe what a template expects; they never imply that a product file exists.

ALTER TABLE catalog_categories
  ADD COLUMN application text,
  ADD COLUMN source_priority jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_priority) = 'object');

CREATE TABLE template_asset_requirements (
  template_id uuid NOT NULL REFERENCES attribute_templates(id) ON DELETE CASCADE,
  type_code text NOT NULL CHECK (type_code IN ('FT', 'MSDS', 'CERT', 'FOTO', 'PLANO')),
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, type_code)
);

CREATE INDEX template_asset_requirements_readiness_idx
  ON template_asset_requirements (template_id, required, active);

-- One row per product keeps every consumer on the same deterministic definition of completeness.
CREATE VIEW catalog_product_readiness AS
SELECT
  product.id AS product_id,
  template.id AS template_id,
  (COALESCE(attributes.required, 0) + COALESCE(assets.required, 0))::int AS required,
  (COALESCE(attributes.completed, 0) + COALESCE(assets.completed, 0))::int AS completed,
  concat_ws(', ', NULLIF(attributes.missing, ''), NULLIF(assets.missing, '')) AS missing_items
FROM products product
LEFT JOIN product_template_assignments assignment ON assignment.product_id = product.id
LEFT JOIN attribute_templates template
  ON template.id = assignment.template_id
 AND template.status = 'active'
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS required,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM product_attribute_values value
        WHERE value.product_id = product.id
          AND value.attribute_definition_id = assignment_rule.attribute_definition_id
          AND value.deleted_at IS NULL
          AND (
            NULLIF(BTRIM(value.value_text), '') IS NOT NULL OR
            value.value_number IS NOT NULL OR
            value.value_boolean IS NOT NULL OR
            value.value_date IS NOT NULL OR
            (value.value_json IS NOT NULL AND value.value_json <> 'null'::jsonb)
          )
      )
    )::int AS completed,
    COALESCE(STRING_AGG(definition.label, ', ' ORDER BY assignment_rule.position)
      FILTER (WHERE NOT EXISTS (
        SELECT 1
        FROM product_attribute_values value
        WHERE value.product_id = product.id
          AND value.attribute_definition_id = assignment_rule.attribute_definition_id
          AND value.deleted_at IS NULL
          AND (
            NULLIF(BTRIM(value.value_text), '') IS NOT NULL OR
            value.value_number IS NOT NULL OR
            value.value_boolean IS NOT NULL OR
            value.value_date IS NOT NULL OR
            (value.value_json IS NOT NULL AND value.value_json <> 'null'::jsonb)
          )
      )), '') AS missing
  FROM template_attribute_assignments assignment_rule
  INNER JOIN attribute_definitions definition
    ON definition.id = assignment_rule.attribute_definition_id
   AND definition.active = true
  WHERE assignment_rule.template_id = template.id
    AND assignment_rule.active = true
    AND assignment_rule.required = true
) attributes ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS required,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM product_assets asset
        WHERE asset.product_id = product.id
          AND asset.type_code = requirement.type_code
          AND asset.deleted_at IS NULL
      )
    )::int AS completed,
    COALESCE(STRING_AGG(
      CASE requirement.type_code
        WHEN 'FT' THEN 'Ficha técnica (FT)'
        WHEN 'MSDS' THEN 'Hoja de seguridad (MSDS)'
        WHEN 'CERT' THEN 'Certificado (CERT)'
        WHEN 'FOTO' THEN 'Fotografía (FOTO)'
        WHEN 'PLANO' THEN 'Plano (PLANO)'
        ELSE requirement.type_code
      END,
      ', ' ORDER BY requirement.type_code
    ) FILTER (WHERE NOT EXISTS (
      SELECT 1
      FROM product_assets asset
      WHERE asset.product_id = product.id
        AND asset.type_code = requirement.type_code
        AND asset.deleted_at IS NULL
    )), '') AS missing
  FROM template_asset_requirements requirement
  WHERE requirement.template_id = template.id
    AND requirement.active = true
    AND requirement.required = true
) assets ON true;

-- Reverse (manual): DROP VIEW catalog_product_readiness; DROP TABLE template_asset_requirements;
-- ALTER TABLE catalog_categories DROP COLUMN source_priority, DROP COLUMN application;
