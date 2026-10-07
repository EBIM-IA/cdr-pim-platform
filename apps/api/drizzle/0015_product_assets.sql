-- Product asset metadata is relational; binary content stays in the configured object store.
-- Replaced/deleted rows remain for provenance while only active rows are exposed by the API.
CREATE TABLE product_assets (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'document')),
  type_code text NOT NULL CHECK (type_code IN ('FT', 'MSDS', 'CERT', 'PLANO', 'FOTO')),
  original_filename text NOT NULL CHECK (
    char_length(original_filename) BETWEEN 1 AND 180
    AND original_filename = btrim(original_filename)
  ),
  object_key text NOT NULL,
  bucket text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  checksum_sha256 text NOT NULL,
  storage_version_id text,
  position integer CHECK (
    (type_code = 'FOTO' AND position IS NOT NULL AND position > 0)
    OR (type_code <> 'FOTO' AND position IS NULL)
  ),
  source text NOT NULL CHECK (source IN ('manual', 'bulk')),
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  replaces_asset_id uuid REFERENCES product_assets(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by text,
  CHECK ((deleted_at IS NULL AND deleted_by IS NULL) OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL))
);

CREATE UNIQUE INDEX product_assets_object_key_key ON product_assets (object_key);
CREATE INDEX product_assets_product_active_idx
  ON product_assets (product_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX product_assets_singleton_active_key
  ON product_assets (product_id, type_code)
  WHERE deleted_at IS NULL AND type_code <> 'FOTO';
CREATE UNIQUE INDEX product_assets_photo_position_active_key
  ON product_assets (product_id, position)
  WHERE deleted_at IS NULL AND type_code = 'FOTO';

-- Reverse (manual): DROP TABLE product_assets;
