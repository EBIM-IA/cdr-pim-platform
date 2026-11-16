-- Preserve the designer-defined section order in every role and technical-sheet export.
ALTER TABLE attribute_templates ADD COLUMN sections jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE template_attribute_assignments ADD COLUMN section_key text;
ALTER TABLE attribute_templates ADD CONSTRAINT attribute_templates_sections_array CHECK (jsonb_typeof(sections) = 'array');
-- Reverse: drop section_key and sections after exporting configured metadata.
