-- A row-level UPDATE/DELETE trigger does not fire for TRUNCATE. Block that separate DDL
-- path as well so the runtime database role cannot silently erase the audit trail.
CREATE TRIGGER audit_entries_no_truncate
  BEFORE TRUNCATE ON audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_entry_mutation();
