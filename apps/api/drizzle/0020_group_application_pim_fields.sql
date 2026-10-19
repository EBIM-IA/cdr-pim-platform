-- Preserve the six explicit columns from the PIM(2) APLICACIONES master.
-- `vehicle_type` remains the AUTOMOTRIZ/INDUSTRIAL group context; workbook `Tipo`
-- is stored separately as `body_style` (for example, HB).
ALTER TABLE group_applications
  ADD COLUMN body_style text,
  ADD COLUMN fuel text,
  ADD COLUMN traction text,
  ADD COLUMN displacement text,
  ADD COLUMN area text,
  ADD COLUMN subarea text,
  ADD CONSTRAINT group_applications_pim_text_lengths CHECK (
    (body_style IS NULL OR length(body_style) <= 200) AND
    (fuel IS NULL OR length(fuel) <= 200) AND
    (traction IS NULL OR length(traction) <= 200) AND
    (displacement IS NULL OR length(displacement) <= 200) AND
    (area IS NULL OR length(area) <= 200) AND
    (subarea IS NULL OR length(subarea) <= 200)
  );

DROP INDEX group_applications_natural_key;

CREATE UNIQUE INDEX group_applications_natural_key
  ON group_applications (
    equivalence_group_id,
    lower(COALESCE(vehicle_type, '')),
    lower(COALESCE(make, '')),
    lower(COALESCE(model, '')),
    lower(COALESCE(body_style, '')),
    lower(COALESCE(fuel, '')),
    lower(COALESCE(traction, '')),
    lower(COALESCE(displacement, '')),
    COALESCE(year_from, 0),
    COALESCE(year_to, 0),
    lower(COALESCE(area, '')),
    lower(COALESCE(subarea, '')),
    lower(COALESCE(engine, ''))
  );
