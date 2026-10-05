-- =============================================================================
-- 0007 — Applications, external homologs and durable import previews
-- =============================================================================
-- Applications and external homologs are owned by the unified-code group. An external
-- homolog is deliberately not inserted into `products`: it only resolves to group members
-- while active and approved (ADR-011).

CREATE TABLE import_batches (
  id               uuid        PRIMARY KEY,
  target           text        NOT NULL,
  format           text        NOT NULL,
  status           text        NOT NULL DEFAULT 'previewed',
  idempotency_key  text        NOT NULL,
  payload_hash     text        NOT NULL,
  category_code    text,
  created_by       text        NOT NULL,
  total_rows       integer     NOT NULL,
  valid_rows       integer     NOT NULL,
  invalid_rows     integer     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,

  CONSTRAINT import_batches_target_allowed
    CHECK (target IN ('category', 'applications', 'homologs')),
  CONSTRAINT import_batches_format_allowed CHECK (format IN ('csv', 'json')),
  CONSTRAINT import_batches_status_allowed
    CHECK (status IN ('previewed', 'confirmed', 'failed')),
  CONSTRAINT import_batches_idempotency_not_blank CHECK (length(btrim(idempotency_key)) >= 8),
  CONSTRAINT import_batches_counts_valid CHECK (
    total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0
    AND valid_rows + invalid_rows = total_rows
  ),
  CONSTRAINT import_batches_category_scope CHECK (
    (target = 'category' AND category_code IS NOT NULL) OR
    (target <> 'category' AND category_code IS NULL)
  )
);

CREATE UNIQUE INDEX import_batches_target_idempotency_key
  ON import_batches (target, idempotency_key);
CREATE INDEX import_batches_created_at_idx ON import_batches (created_at DESC);

CREATE TABLE import_rows (
  batch_id     uuid        NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  row_number   integer     NOT NULL,
  valid        boolean     NOT NULL,
  data         jsonb       NOT NULL,
  errors       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (batch_id, row_number),
  CONSTRAINT import_rows_number_positive CHECK (row_number > 0),
  CONSTRAINT import_rows_data_object CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT import_rows_errors_array CHECK (jsonb_typeof(errors) = 'array')
);

CREATE INDEX import_rows_batch_valid_idx ON import_rows (batch_id, valid);

CREATE TABLE group_applications (
  id                   uuid        PRIMARY KEY,
  equivalence_group_id uuid        NOT NULL REFERENCES equivalence_groups (id) ON DELETE CASCADE,
  vehicle_type         text,
  make                 text,
  model                text,
  year_from             integer,
  year_to               integer,
  engine                text,
  notes                 text,
  active                boolean     NOT NULL DEFAULT true,
  source                text        NOT NULL DEFAULT 'manual',
  import_batch_id       uuid        REFERENCES import_batches (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_applications_year_range CHECK (
    (year_from IS NULL OR year_from BETWEEN 1886 AND 2200) AND
    (year_to IS NULL OR year_to BETWEEN 1886 AND 2200) AND
    (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)
  ),
  CONSTRAINT group_applications_source_allowed CHECK (source IN ('manual', 'import'))
);

CREATE INDEX group_applications_group_idx
  ON group_applications (equivalence_group_id, active);
CREATE UNIQUE INDEX group_applications_natural_key
  ON group_applications (
    equivalence_group_id,
    lower(COALESCE(vehicle_type, '')),
    lower(COALESCE(make, '')),
    lower(COALESCE(model, '')),
    COALESCE(year_from, 0),
    COALESCE(year_to, 0),
    lower(COALESCE(engine, ''))
  );

CREATE TRIGGER group_applications_set_updated_at
  BEFORE UPDATE ON group_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE external_homologs (
  id                   uuid        PRIMARY KEY,
  equivalence_group_id uuid        NOT NULL REFERENCES equivalence_groups (id) ON DELETE CASCADE,
  external_code        text        NOT NULL,
  external_brand       text        NOT NULL,
  active               boolean     NOT NULL DEFAULT true,
  approval_status      text        NOT NULL DEFAULT 'pending',
  source               text        NOT NULL DEFAULT 'manual',
  import_batch_id       uuid        REFERENCES import_batches (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT external_homologs_code_not_blank CHECK (length(btrim(external_code)) > 0),
  CONSTRAINT external_homologs_brand_not_blank CHECK (length(btrim(external_brand)) > 0),
  CONSTRAINT external_homologs_approval_allowed
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT external_homologs_source_allowed CHECK (source IN ('manual', 'import'))
);

CREATE UNIQUE INDEX external_homologs_natural_key
  ON external_homologs (equivalence_group_id, lower(external_code), lower(external_brand));
CREATE INDEX external_homologs_group_idx
  ON external_homologs (equivalence_group_id, active, approval_status);
-- Partial index keeps the externally searchable set small and encodes the eligibility rule.
CREATE INDEX external_homologs_eligible_search_idx
  ON external_homologs (lower(external_code), lower(external_brand))
  WHERE active = true AND approval_status = 'approved';

CREATE TRIGGER external_homologs_set_updated_at
  BEFORE UPDATE ON external_homologs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

