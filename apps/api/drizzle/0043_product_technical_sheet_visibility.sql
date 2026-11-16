-- Per-SKU commercial document visibility. Existing products remain visible.
-- Reverse: DROP TABLE product_technical_sheet_visibility;
CREATE TABLE product_technical_sheet_visibility (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
