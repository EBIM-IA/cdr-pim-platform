-- Persist the configuration vocabulary instead of hardcoding search synonyms or losing
-- administrator edits on reload. Reference entries are independent of ERP code contracts.
CREATE TABLE catalog_parameters (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('unit','material','seal','identifier','brand','application','synonym')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  target text,
  logo_data_url text,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'synonym' OR (target IS NOT NULL AND length(btrim(target)) > 0)),
  CHECK (logo_data_url IS NULL OR kind = 'brand')
);
CREATE UNIQUE INDEX catalog_parameters_kind_value_key ON catalog_parameters (kind, lower(value));
INSERT INTO catalog_parameters (id, kind, value, target) VALUES
 ('a5290000-0000-4000-8000-000000000001','synonym','ruliman','rodamiento'),
 ('a5290000-0000-4000-8000-000000000002','synonym','balinera','rodamiento'),
 ('a5290000-0000-4000-8000-000000000003','synonym','reten','retenedor'),
 ('a5290000-0000-4000-8000-000000000004','synonym','faja','banda'),
 ('a5290000-0000-4000-8000-000000000005','synonym','balata','pastilla');
-- Reverse (destructive, only before user edits exist): DROP TABLE catalog_parameters;
