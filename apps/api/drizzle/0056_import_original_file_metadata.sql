-- Preserve the uploaded file identity after the browser maps CSV/XLSX to JSON records.
-- Legacy batches deliberately keep NULL: their original filename cannot be recovered.
ALTER TABLE import_batches
  ADD COLUMN original_file_name text,
  ADD COLUMN source_file_format text,
  ADD CONSTRAINT import_batches_original_file_name_check CHECK (
    original_file_name IS NULL OR (
      char_length(original_file_name) BETWEEN 1 AND 255
      AND btrim(original_file_name) = original_file_name
      AND original_file_name NOT IN ('.', '..')
      AND strpos(original_file_name, '/') = 0
      AND strpos(original_file_name, chr(92)) = 0
      AND original_file_name !~ '[[:cntrl:]]'
    )
  ),
  ADD CONSTRAINT import_batches_source_file_format_check CHECK (
    source_file_format IS NULL OR source_file_format IN ('csv', 'xlsx')
  );

-- Reverse (only before file metadata is relied on): drop both named constraints,
-- then source_file_format and original_file_name. Do not rewrite prior migrations.
