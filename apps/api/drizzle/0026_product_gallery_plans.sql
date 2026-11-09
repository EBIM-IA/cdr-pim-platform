-- Plans now have the same persistent gallery positions as photographs.
-- Existing plans become the first plan; no uploaded object is removed.
ALTER TABLE product_assets DROP CONSTRAINT product_assets_check;
UPDATE product_assets SET position = 1 WHERE type_code = 'PLANO';
ALTER TABLE product_assets ADD CONSTRAINT product_assets_position_check CHECK (
  (type_code IN ('FOTO', 'PLANO') AND position IS NOT NULL AND position > 0)
  OR (type_code NOT IN ('FOTO', 'PLANO') AND position IS NULL)
);
DROP INDEX product_assets_singleton_active_key;
DROP INDEX product_assets_photo_position_active_key;
CREATE UNIQUE INDEX product_assets_singleton_active_key ON product_assets(product_id, type_code)
  WHERE deleted_at IS NULL AND type_code NOT IN ('FOTO', 'PLANO');
CREATE UNIQUE INDEX product_assets_photo_position_active_key ON product_assets(product_id, type_code, position)
  WHERE deleted_at IS NULL AND type_code IN ('FOTO', 'PLANO');
