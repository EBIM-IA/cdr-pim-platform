-- Explicit local Excel import retains supplied ERP codes without assuming an AX contract.
CREATE TABLE catalog_category_erp_codes(category_id uuid PRIMARY KEY REFERENCES catalog_categories(id) ON DELETE CASCADE, code text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE category_dynamic_attributes(attribute_definition_id uuid PRIMARY KEY REFERENCES attribute_definitions(id), category_id uuid NOT NULL REFERENCES catalog_categories(id), required boolean NOT NULL DEFAULT false, include_in_technical_sheet boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL);

-- Inheritance materializes into the existing assignment model, so all existing sheets,
-- validation, completeness, imports and exports use the same effective definition.
CREATE FUNCTION sync_category_dynamic_attributes() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM template_attribute_role_access access USING category_dynamic_attributes dynamic
  WHERE access.attribute_definition_id=dynamic.attribute_definition_id AND NOT EXISTS (
    WITH RECURSIVE ancestors AS (SELECT category_id AS id FROM attribute_templates WHERE id=access.template_id UNION ALL SELECT category.parent_id FROM catalog_categories category JOIN ancestors ON category.id=ancestors.id WHERE category.parent_id IS NOT NULL)
    SELECT 1 FROM ancestors WHERE id=dynamic.category_id AND dynamic.active
  );
  DELETE FROM template_attribute_assignments assignment USING category_dynamic_attributes dynamic
  WHERE assignment.attribute_definition_id=dynamic.attribute_definition_id AND NOT EXISTS (
    WITH RECURSIVE ancestors AS (SELECT category_id AS id FROM attribute_templates WHERE id=assignment.template_id UNION ALL SELECT category.parent_id FROM catalog_categories category JOIN ancestors ON category.id=ancestors.id WHERE category.parent_id IS NOT NULL)
    SELECT 1 FROM ancestors WHERE id=dynamic.category_id AND dynamic.active
  );
  WITH RECURSIVE descendants AS (
    SELECT attribute_definition_id,category_id AS id,required,include_in_technical_sheet FROM category_dynamic_attributes WHERE active
    UNION ALL SELECT ancestor.attribute_definition_id,child.id,ancestor.required,ancestor.include_in_technical_sheet FROM descendants ancestor JOIN catalog_categories child ON child.parent_id=ancestor.id
  )
  INSERT INTO template_attribute_assignments(template_id,attribute_definition_id,position,required,active,include_in_technical_sheet,publishable)
  SELECT template.id,dynamic.attribute_definition_id,10000,dynamic.required,true,dynamic.include_in_technical_sheet,true FROM descendants dynamic JOIN attribute_templates template ON template.category_id=dynamic.id
  ON CONFLICT(template_id,attribute_definition_id) DO UPDATE SET required=EXCLUDED.required,active=true,include_in_technical_sheet=EXCLUDED.include_in_technical_sheet,updated_at=now();
  INSERT INTO template_attribute_role_access(template_id,attribute_definition_id,role,can_view,can_edit,can_import,can_export)
  SELECT assignment.template_id,assignment.attribute_definition_id,role.name,true,role.name='ADMINISTRADOR',role.name='ADMINISTRADOR',true FROM template_attribute_assignments assignment JOIN category_dynamic_attributes dynamic ON dynamic.attribute_definition_id=assignment.attribute_definition_id AND dynamic.active CROSS JOIN (VALUES ('ADMINISTRADOR'),('COMPRAS'),('VENTAS')) AS role(name)
  ON CONFLICT(template_id,attribute_definition_id,role) DO NOTHING;
END $$;
CREATE FUNCTION refresh_category_dynamic_attributes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM sync_category_dynamic_attributes(); RETURN NULL; END $$;
-- Deferred refresh runs after template copies finish; values are retained if scope changes.
CREATE CONSTRAINT TRIGGER template_dynamic_attributes AFTER INSERT OR UPDATE OF category_id ON attribute_templates DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refresh_category_dynamic_attributes();
CREATE CONSTRAINT TRIGGER category_dynamic_scope AFTER UPDATE OF parent_id ON catalog_categories DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refresh_category_dynamic_attributes();
