-- Optimistic tokens must advance even when two governance writes share a millisecond.
-- Keep the existing timestamp policy for other aggregates unchanged.
CREATE FUNCTION set_catalog_governance_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = GREATEST(clock_timestamp(), OLD.updated_at + interval '1 millisecond');
  RETURN NEW;
END;
$$;
DROP TRIGGER attribute_templates_set_updated_at ON attribute_templates;
CREATE TRIGGER attribute_templates_set_updated_at BEFORE UPDATE ON attribute_templates
FOR EACH ROW EXECUTE FUNCTION set_catalog_governance_updated_at();
DROP TRIGGER template_attribute_assignments_set_updated_at ON template_attribute_assignments;
CREATE TRIGGER template_attribute_assignments_set_updated_at BEFORE UPDATE ON template_attribute_assignments
FOR EACH ROW EXECUTE FUNCTION set_catalog_governance_updated_at();
DROP TRIGGER attribute_definitions_set_updated_at ON attribute_definitions;
CREATE TRIGGER attribute_definitions_set_updated_at BEFORE UPDATE ON attribute_definitions
FOR EACH ROW EXECUTE FUNCTION set_catalog_governance_updated_at();
-- Reverse: recreate these three triggers with set_updated_at(), then drop the new function.
