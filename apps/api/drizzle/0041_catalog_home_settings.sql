-- Versioned Home presentation assets and ordering, independent from ERP master data.
-- Reverse: DROP TABLE catalog_home_settings;
CREATE TABLE catalog_home_settings (
  id text PRIMARY KEY,
  config jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
