-- =============================================================================
-- 0000 — Required PostgreSQL extensions
-- =============================================================================
-- Kept in its own migration because extension creation needs elevated privileges and
-- may have to be pre-applied by the DBA/RDS parameter group in PRD, independently of the
-- application's own DDL. `pgvector` is available on Amazon RDS PostgreSQL 15+ out of the
-- box; no custom compilation is needed.
--
-- Reversible: DROP EXTENSION vector CASCADE;  (destroys every vector column — do not run
-- casually; recorded here for completeness only.)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
