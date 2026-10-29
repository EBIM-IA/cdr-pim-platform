-- Shared, versioned product-name formulas from the client design of 2026-10-28.
-- Existing ERP identities and curated attribute values are never rewritten.
CREATE TABLE product_name_settings (
  id text PRIMARY KEY CHECK (id = 'product-name'),
  config jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Reverse: DROP TABLE product_name_settings; audit history is retained.
