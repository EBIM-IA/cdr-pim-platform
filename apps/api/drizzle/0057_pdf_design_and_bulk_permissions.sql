-- Approved 17 November handoff: shared PDF designs and a role-level bulk action.
-- Historical per-product visibility is retained for audit compatibility, no longer enforced.
ALTER TABLE identity_module_policies DROP CONSTRAINT identity_module_policies_capability_check;
ALTER TABLE identity_module_policies ADD CONSTRAINT identity_module_policies_capability_check
  CHECK(capability LIKE 'menu:%:view' OR capability = 'technical-sheets:bulk');
ALTER TABLE identity_module_policies ADD CONSTRAINT administrator_bulk_pdf_access
  CHECK(role <> 'ADMINISTRADOR' OR capability <> 'technical-sheets:bulk' OR visible);

CREATE TABLE pdf_design_settings (
  id text PRIMARY KEY CHECK(id = 'default'),
  config jsonb NOT NULL CHECK(jsonb_typeof(config) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
