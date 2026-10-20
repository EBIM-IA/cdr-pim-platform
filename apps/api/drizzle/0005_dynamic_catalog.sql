-- =============================================================================
-- 0005 — Versioned category templates and typed product attributes
-- =============================================================================

CREATE TABLE catalog_categories (
  id          uuid        PRIMARY KEY,
  parent_id   uuid        REFERENCES catalog_categories (id) ON DELETE RESTRICT,
  slug        text        NOT NULL,
  name        text        NOT NULL,
  path        text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT catalog_categories_slug_not_blank CHECK (length(btrim(slug)) > 0),
  CONSTRAINT catalog_categories_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT catalog_categories_path_not_blank CHECK (length(btrim(path)) > 0),
  CONSTRAINT catalog_categories_position_non_negative CHECK (position >= 0)
);

CREATE UNIQUE INDEX catalog_categories_slug_key ON catalog_categories (slug);
CREATE UNIQUE INDEX catalog_categories_path_key ON catalog_categories (path);
CREATE INDEX catalog_categories_parent_position_idx
  ON catalog_categories (parent_id, position);

CREATE TRIGGER catalog_categories_set_updated_at
  BEFORE UPDATE ON catalog_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attribute_definitions (
  id                uuid        PRIMARY KEY,
  key               text        NOT NULL,
  label             text        NOT NULL,
  data_type         text        NOT NULL,
  unit              text,
  allowed_values    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  active            boolean     NOT NULL DEFAULT true,
  source_authority  text        NOT NULL DEFAULT 'pim',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attribute_definitions_key_not_blank CHECK (length(btrim(key)) > 0),
  CONSTRAINT attribute_definitions_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT attribute_definitions_data_type_allowed CHECK (
    data_type IN ('text', 'number', 'boolean', 'date', 'enum', 'measurement')
  ),
  CONSTRAINT attribute_definitions_source_authority_allowed CHECK (
    source_authority IN ('pim', 'erp', 'supplier', 'calculated')
  ),
  CONSTRAINT attribute_definitions_unit_required CHECK (
    data_type <> 'measurement' OR length(btrim(unit)) > 0
  ),
  CONSTRAINT attribute_definitions_enum_values_required CHECK (
    data_type <> 'enum'
    OR (jsonb_typeof(allowed_values) = 'array' AND jsonb_array_length(allowed_values) > 0)
  )
);

CREATE UNIQUE INDEX attribute_definitions_key_key ON attribute_definitions (key);

CREATE TRIGGER attribute_definitions_set_updated_at
  BEFORE UPDATE ON attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attribute_templates (
  id           uuid        PRIMARY KEY,
  category_id  uuid        NOT NULL REFERENCES catalog_categories (id) ON DELETE RESTRICT,
  name         text        NOT NULL,
  version      integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'draft',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attribute_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT attribute_templates_version_positive CHECK (version > 0),
  CONSTRAINT attribute_templates_status_allowed CHECK (status IN ('draft', 'active', 'retired'))
);

CREATE UNIQUE INDEX attribute_templates_category_version_key
  ON attribute_templates (category_id, version);
CREATE UNIQUE INDEX attribute_templates_one_active_per_category
  ON attribute_templates (category_id) WHERE status = 'active';

CREATE TRIGGER attribute_templates_set_updated_at
  BEFORE UPDATE ON attribute_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE template_attribute_assignments (
  template_id              uuid        NOT NULL REFERENCES attribute_templates (id) ON DELETE CASCADE,
  attribute_definition_id  uuid        NOT NULL REFERENCES attribute_definitions (id) ON DELETE RESTRICT,
  position                 integer     NOT NULL DEFAULT 0,
  required                 boolean     NOT NULL DEFAULT false,
  replicable               boolean     NOT NULL DEFAULT false,
  active                   boolean     NOT NULL DEFAULT true,
  searchable               boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (template_id, attribute_definition_id),
  CONSTRAINT template_attribute_assignments_position_non_negative CHECK (position >= 0)
);

CREATE INDEX template_attribute_assignments_display_idx
  ON template_attribute_assignments (template_id, active, position);

CREATE TRIGGER template_attribute_assignments_set_updated_at
  BEFORE UPDATE ON template_attribute_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE template_attribute_role_access (
  template_id              uuid    NOT NULL,
  attribute_definition_id  uuid    NOT NULL,
  role                     text    NOT NULL,
  can_view                 boolean NOT NULL DEFAULT false,
  can_edit                 boolean NOT NULL DEFAULT false,
  can_import               boolean NOT NULL DEFAULT false,
  can_export               boolean NOT NULL DEFAULT false,

  PRIMARY KEY (template_id, attribute_definition_id, role),
  FOREIGN KEY (template_id, attribute_definition_id)
    REFERENCES template_attribute_assignments (template_id, attribute_definition_id)
    ON DELETE CASCADE,
  CONSTRAINT template_attribute_role_access_role_allowed CHECK (
    role IN ('ADMINISTRADOR', 'COMPRAS', 'VENTAS')
  ),
  CONSTRAINT template_attribute_role_access_edit_requires_view CHECK (
    NOT can_edit OR can_view
  ),
  CONSTRAINT template_attribute_role_access_export_requires_view CHECK (
    NOT can_export OR can_view
  )
);

CREATE INDEX template_attribute_role_access_lookup_idx
  ON template_attribute_role_access (role, can_view, template_id);

CREATE TABLE product_template_assignments (
  product_id    uuid        PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
  template_id   uuid        NOT NULL REFERENCES attribute_templates (id) ON DELETE RESTRICT,
  assigned_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_template_assignments_template_idx
  ON product_template_assignments (template_id, product_id);

CREATE TABLE product_attribute_values (
  product_id               uuid        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  attribute_definition_id  uuid        NOT NULL REFERENCES attribute_definitions (id) ON DELETE RESTRICT,
  value_text               text,
  value_number             numeric,
  value_boolean            boolean,
  value_date               date,
  value_json               jsonb,
  source                   text        NOT NULL DEFAULT 'manual',
  confidence               numeric(4,3) NOT NULL DEFAULT 1,
  version                  integer     NOT NULL DEFAULT 1,
  valid_from               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (product_id, attribute_definition_id),
  CONSTRAINT product_attribute_values_one_typed_value CHECK (
    num_nonnulls(value_text, value_number, value_boolean, value_date, value_json) = 1
  ),
  CONSTRAINT product_attribute_values_source_allowed CHECK (
    source IN ('manual', 'erp', 'import', 'document_extraction', 'ai_generated')
  ),
  CONSTRAINT product_attribute_values_confidence_range CHECK (
    confidence >= 0 AND confidence <= 1
  ),
  CONSTRAINT product_attribute_values_version_positive CHECK (version > 0)
);

CREATE INDEX product_attribute_values_attribute_text_idx
  ON product_attribute_values (attribute_definition_id, value_text);
CREATE INDEX product_attribute_values_attribute_number_idx
  ON product_attribute_values (attribute_definition_id, value_number);
CREATE INDEX product_attribute_values_attribute_boolean_idx
  ON product_attribute_values (attribute_definition_id, value_boolean);
CREATE INDEX product_attribute_values_attribute_date_idx
  ON product_attribute_values (attribute_definition_id, value_date);

CREATE TRIGGER product_attribute_values_set_updated_at
  BEFORE UPDATE ON product_attribute_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
