-- =============================================================================
-- 0001 — Core catalog skeleton
-- =============================================================================
-- Deliberately minimal: only the tables required to exercise the walking skeleton and to
-- pin down the two modelling decisions we do not want re-litigated later —
--
--   * a product's external codes are ROWS in `product_identifiers`, not columns on
--     `products`, because a SKU can carry an ERP id, an MPN, an EAN and legacy codes;
--   * an equivalence ("código unificador") is its OWN aggregate, not a string on the
--     product, so it can hold N products and a product can belong to N groups.
--
-- Attributes, categories, documents, images and data-quality tables are intentionally
-- NOT created yet — they need functional decisions from Casa del Rulimán (ADR-005).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared trigger: keep `updated_at` honest without trusting the application.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
CREATE TABLE products (
  id           uuid        PRIMARY KEY,
  sku          text        NOT NULL,
  name         text        NOT NULL,
  description  text,
  brand        text,
  status       text        NOT NULL DEFAULT 'draft',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_sku_not_blank CHECK (length(btrim(sku)) > 0),
  CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0),
  -- A CHECK rather than an ENUM type: adding a status later is a one-line migration,
  -- whereas ALTER TYPE ... ADD VALUE cannot run inside a transaction on older servers.
  CONSTRAINT products_status_allowed
    CHECK (status IN ('draft', 'in_review', 'published', 'archived'))
);

CREATE UNIQUE INDEX products_sku_key ON products (sku);
CREATE INDEX products_status_idx ON products (status);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- product_identifiers — every external code by which a product is known
-- -----------------------------------------------------------------------------
CREATE TABLE product_identifiers (
  id          uuid        PRIMARY KEY,
  product_id  uuid        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  type        text        NOT NULL,
  value       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_identifiers_type_allowed CHECK (
    type IN ('sku', 'erp_item_id', 'manufacturer_part_number', 'ean', 'upc', 'internal_legacy')
  ),
  CONSTRAINT product_identifiers_value_not_blank CHECK (length(btrim(value)) > 0)
);

-- The same physical code must not be claimed by two products for the same code type.
CREATE UNIQUE INDEX product_identifiers_type_value_key ON product_identifiers (type, value);
CREATE INDEX product_identifiers_product_idx ON product_identifiers (product_id);

-- -----------------------------------------------------------------------------
-- equivalence_groups — the "código unificador" as a first-class aggregate
-- -----------------------------------------------------------------------------
CREATE TABLE equivalence_groups (
  id          uuid        PRIMARY KEY,
  code        text        NOT NULL,
  name        text        NOT NULL,
  -- 'interchange'  : parts that substitute one another across manufacturers
  -- 'supersession' : a part officially replaced by a newer one
  kind        text        NOT NULL DEFAULT 'interchange',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT equivalence_groups_kind_allowed CHECK (kind IN ('interchange', 'supersession')),
  CONSTRAINT equivalence_groups_code_not_blank CHECK (length(btrim(code)) > 0)
);

CREATE UNIQUE INDEX equivalence_groups_code_key ON equivalence_groups (code);

CREATE TRIGGER equivalence_groups_set_updated_at
  BEFORE UPDATE ON equivalence_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- equivalence_group_members — the N:N join that makes 1:N and N:N both expressible
-- -----------------------------------------------------------------------------
CREATE TABLE equivalence_group_members (
  group_id    uuid        NOT NULL REFERENCES equivalence_groups (id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- 'primary' marks the preferred/reference product of the group, if any.
  role        text        NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (group_id, product_id),
  CONSTRAINT equivalence_group_members_role_allowed CHECK (role IN ('primary', 'member'))
);

CREATE INDEX equivalence_group_members_product_idx ON equivalence_group_members (product_id);

-- At most one primary product per group.
CREATE UNIQUE INDEX equivalence_group_members_one_primary
  ON equivalence_group_members (group_id)
  WHERE role = 'primary';
