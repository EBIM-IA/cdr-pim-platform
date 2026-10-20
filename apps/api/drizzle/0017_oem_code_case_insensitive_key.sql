-- OEM codes are normalized by the domain today, but the database is the final concurrency
-- boundary. Match findByNaturalKey/search semantics and reject case-only duplicates even for
-- direct or legacy writers.

DROP INDEX group_oem_codes_natural_key;

CREATE UNIQUE INDEX group_oem_codes_natural_key
  ON group_oem_codes (equivalence_group_id, lower(oem_code));
