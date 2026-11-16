-- Optional homolog reference information defined by the designer's HOM_COLUMNS.
-- Keep reference_source separate from source, which records manual/import provenance.
ALTER TABLE external_homologs
  ADD COLUMN name text,
  ADD COLUMN reference_type text,
  ADD COLUMN reference_source text,
  ADD COLUMN note text,
  ADD CONSTRAINT external_homologs_metadata_lengths CHECK (
    (name IS NULL OR char_length(name) <= 500)
    AND (reference_type IS NULL OR char_length(reference_type) <= 160)
    AND (reference_source IS NULL OR char_length(reference_source) <= 300)
    AND (note IS NULL OR char_length(note) <= 2000)
  );
-- Reverse: drop external_homologs_metadata_lengths and these four nullable columns.
