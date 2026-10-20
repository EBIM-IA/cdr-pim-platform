-- Source is an explicit filter of the audit history endpoint.
CREATE INDEX audit_entries_source_idx
  ON audit_entries (source, occurred_at DESC);
