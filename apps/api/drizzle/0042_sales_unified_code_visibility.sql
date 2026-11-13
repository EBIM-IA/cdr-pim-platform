-- The November 12 approved sales UI identifies groups by unified code.
-- Change only read visibility for this identity field. Editing/import/export grants stay intact.
-- Administrators can subsequently disable it per template using the existing field controls.
-- Reverse requires restoring the preceding per-template visibility from audit/backup.
UPDATE template_attribute_role_access AS access
SET can_view = TRUE
FROM attribute_definitions AS definition
WHERE access.attribute_definition_id = definition.id
  AND definition.key = 'codigo_unificador'
  AND access.role = 'VENTAS'
  AND access.can_view = FALSE;
