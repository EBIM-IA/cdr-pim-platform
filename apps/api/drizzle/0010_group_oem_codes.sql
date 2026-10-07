-- =============================================================================
-- 0010 — OEM codes owned by automotive unified-code groups
-- =============================================================================
-- An OEM code identifies the vehicle manufacturer's original part. It belongs to the
-- codigoUnificador, never to an individual sellable SKU. Eligibility for search requires
-- both `active` and `approved`; automotive scope is enforced by the application service.

CREATE TABLE group_oem_codes (
  id                   uuid        PRIMARY KEY,
  equivalence_group_id uuid        NOT NULL REFERENCES equivalence_groups (id) ON DELETE CASCADE,
  oem_code             text        NOT NULL,
  brands               text[]      NOT NULL,
  active               boolean     NOT NULL DEFAULT true,
  approval_status      text        NOT NULL DEFAULT 'pending',
  source               text        NOT NULL DEFAULT 'manual',
  import_batch_id      uuid        REFERENCES import_batches (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_oem_codes_code_not_blank CHECK (length(btrim(oem_code)) > 0),
  CONSTRAINT group_oem_codes_brands_not_empty CHECK (cardinality(brands) > 0),
  CONSTRAINT group_oem_codes_approval_allowed
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT group_oem_codes_source_allowed CHECK (source IN ('manual', 'import'))
);

CREATE UNIQUE INDEX group_oem_codes_natural_key
  ON group_oem_codes (equivalence_group_id, oem_code);
CREATE INDEX group_oem_codes_group_idx
  ON group_oem_codes (equivalence_group_id, active, approval_status);
CREATE INDEX group_oem_codes_brands_gin_idx ON group_oem_codes USING gin (brands);
CREATE INDEX group_oem_codes_eligible_search_idx
  ON group_oem_codes (oem_code)
  WHERE active = true AND approval_status = 'approved';

CREATE TRIGGER group_oem_codes_set_updated_at
  BEFORE UPDATE ON group_oem_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
