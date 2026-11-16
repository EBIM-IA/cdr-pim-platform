-- Store client-supplied application columns without inventing official fields.
ALTER TABLE group_applications ADD COLUMN additional_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE application_column_settings (
 id text PRIMARY KEY CHECK (id = 'default'),
 columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns) = 'array'),
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO application_column_settings (id) VALUES ('default');
-- Reverse: export customer data before dropping this metadata and additional_fields.
