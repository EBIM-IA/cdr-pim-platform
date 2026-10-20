-- =============================================================================
-- 0006 — Field-level audit read model
-- =============================================================================
-- Keeps the original immutable event envelope and materialises one append-only row per
-- changed field. This makes history filters and the previous-value validity interval
-- queryable without repeatedly expanding JSON at request time.
-- =============================================================================

CREATE TABLE audit_change_items (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_entry_id             uuid        NOT NULL REFERENCES audit_entries(id),
  field_name                 text        NOT NULL,
  before_value               jsonb,
  after_value                jsonb,
  previous_value_valid_from  timestamptz,

  CONSTRAINT audit_change_items_field_not_blank CHECK (length(btrim(field_name)) > 0),
  CONSTRAINT audit_change_items_entry_field_unique UNIQUE (audit_entry_id, field_name)
);

CREATE INDEX audit_change_items_field_idx
  ON audit_change_items (field_name, audit_entry_id);
CREATE INDEX audit_change_items_entry_idx
  ON audit_change_items (audit_entry_id);

-- Preserve the history already captured before this read model existed.
WITH expanded AS (
  SELECT
    ae.id AS audit_entry_id,
    ae.resource_type,
    ae.resource_id,
    ae.occurred_at,
    change.key AS field_name,
    change.value AS field_change,
    lag(ae.occurred_at) OVER (
      PARTITION BY ae.resource_type, ae.resource_id, change.key
      ORDER BY ae.occurred_at, ae.id
    ) AS previous_value_valid_from
  FROM audit_entries ae
  CROSS JOIN LATERAL jsonb_each(ae.changes) AS change(key, value)
)
INSERT INTO audit_change_items (
  audit_entry_id,
  field_name,
  before_value,
  after_value,
  previous_value_valid_from
)
SELECT
  audit_entry_id,
  field_name,
  CASE WHEN field_change ? 'before' THEN field_change -> 'before' END,
  CASE WHEN field_change ? 'after' THEN field_change -> 'after' END,
  previous_value_valid_from
FROM expanded
WHERE field_change ? 'before' OR field_change ? 'after';

CREATE TRIGGER audit_change_items_append_only
  BEFORE UPDATE OR DELETE ON audit_change_items
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();

CREATE TRIGGER audit_change_items_no_truncate
  BEFORE TRUNCATE ON audit_change_items
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_entry_mutation();
