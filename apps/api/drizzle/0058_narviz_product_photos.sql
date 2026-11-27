-- Keep upload provenance with the private gallery entry, including after removal.
ALTER TABLE product_assets
  ADD COLUMN ecommerce_sku text,
  DROP CONSTRAINT product_assets_source_check,
  DROP CONSTRAINT product_assets_size_bytes_check,
  ADD CONSTRAINT product_assets_source_check CHECK (
    (source IN ('manual', 'bulk') AND ecommerce_sku IS NULL)
    OR (source = 'narviz' AND type_code = 'FOTO' AND ecommerce_sku IS NOT NULL
        AND char_length(ecommerce_sku) BETWEEN 1 AND 128)
  ),
  ADD CONSTRAINT product_assets_size_bytes_check CHECK (
    size_bytes BETWEEN 1 AND CASE WHEN source = 'narviz' THEN 30000000 ELSE 20971520 END
  );

CREATE INDEX product_assets_narviz_history_idx
  ON product_assets (uploaded_at DESC, id DESC) WHERE source = 'narviz';
