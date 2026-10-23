-- Private PDF catalog metadata and revocable, digest-only access grants. Soft deletion
-- preserves recoverable PDFs while permanently revoking existing grants.
-- Reverse before use: DROP TABLE product_catalog_shares; DROP TABLE product_catalogs;
CREATE TABLE product_catalogs (
 id uuid PRIMARY KEY, sequence_number bigserial NOT NULL UNIQUE,
 code text GENERATED ALWAYS AS ('CAT-' || lpad(sequence_number::text, GREATEST(4, length(sequence_number::text)), '0')) STORED NOT NULL UNIQUE, title text NOT NULL, description text NOT NULL,
 valid_from date NOT NULL, valid_until date, file_name text NOT NULL,
 file_size bigint NOT NULL, object_key text NOT NULL,
 created_by jsonb NOT NULL, created_at timestamptz NOT NULL,
 updated_by jsonb NOT NULL, updated_at timestamptz NOT NULL,
 deleted_at timestamptz, deleted_by jsonb,
 CONSTRAINT product_catalogs_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 CONSTRAINT product_catalogs_description_check CHECK (length(description) <= 1000),
 CONSTRAINT product_catalogs_dates_check CHECK (valid_until IS NULL OR valid_until >= valid_from),
 CONSTRAINT product_catalogs_size_check CHECK (file_size > 0 AND file_size <= 52428800),
 CONSTRAINT product_catalogs_deleted_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE UNIQUE INDEX product_catalogs_object_key_key ON product_catalogs(object_key);
CREATE INDEX product_catalogs_updated_idx ON product_catalogs(updated_at, id);
CREATE TABLE product_catalog_shares (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES product_catalogs(id),
 token_digest text NOT NULL, term text NOT NULL, note text NOT NULL,
 expires_at timestamptz, created_by jsonb NOT NULL, created_at timestamptz NOT NULL,
 revoked_at timestamptz, revoked_by jsonb, views integer NOT NULL DEFAULT 0,
 last_viewed_at timestamptz, updated_at timestamptz NOT NULL,
 CONSTRAINT product_catalog_shares_digest_check CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 CONSTRAINT product_catalog_shares_term_check CHECK (term IN ('1d','3d','7d','1m','3m','6m','never')),
 CONSTRAINT product_catalog_shares_note_check CHECK (length(note) <= 80),
 CONSTRAINT product_catalog_shares_views_check CHECK (views >= 0),
 CONSTRAINT product_catalog_shares_expiry_check CHECK ((term = 'never') = (expires_at IS NULL)),
 CONSTRAINT product_catalog_shares_revoked_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX product_catalog_shares_digest_key ON product_catalog_shares(token_digest);
CREATE INDEX product_catalog_shares_catalog_idx ON product_catalog_shares(catalog_id);
