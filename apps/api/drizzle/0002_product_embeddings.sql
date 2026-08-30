-- =============================================================================
-- 0002 — Semantic search substrate (pgvector)
-- =============================================================================
-- One row per (product, embedding model). Keeping the model on the row — instead of a
-- single "current" vector — is what makes a model migration safe: the new model can be
-- back-filled alongside the old one and traffic switched over only when coverage is
-- complete. See `docs/architecture/AI_ARCHITECTURE.md` (re-embedding strategy).
--
-- The column width is FIXED at 1536 (OpenAI text-embedding-3-small / -3-large truncated).
-- `AI_EMBEDDING_DIMENSIONS` must match it; the API refuses to start otherwise. Moving to
-- another width is a new migration plus a full re-embedding, never an in-place ALTER.
--
-- Reversible: DROP TABLE product_embeddings;
-- =============================================================================

CREATE TABLE product_embeddings (
  id           uuid         PRIMARY KEY,
  product_id   uuid         NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  model        text         NOT NULL,
  dimensions   integer      NOT NULL,
  embedding    vector(1536) NOT NULL,
  -- SHA-256 of the exact text that was embedded. Lets the worker skip a product whose
  -- source text has not changed, which is the main cost control for re-embedding 45k SKU.
  source_hash  text         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT product_embeddings_dimensions_supported CHECK (dimensions = 1536)
);

CREATE UNIQUE INDEX product_embeddings_product_model_key
  ON product_embeddings (product_id, model);

-- -----------------------------------------------------------------------------
-- HNSW index for approximate nearest-neighbour search under cosine distance.
--
-- Chosen over IVFFlat because it needs no training step and its recall does not degrade
-- as rows are inserted one at a time by the embedding worker.
--
-- m = 16 / ef_construction = 64 are pgvector's defaults and are appropriate at this
-- scale (~45k rows). They are written out explicitly so a future tuning change is a
-- visible diff rather than a silent dependency on the extension's defaults.
--
-- NOTE ON SCALE: at 45k rows a sequential scan is also perfectly viable. The index is
-- created now because it is cheap here and rebuilding it on a populated table later would
-- need CONCURRENTLY and a maintenance window — not because the volume demands it.
-- -----------------------------------------------------------------------------
CREATE INDEX product_embeddings_hnsw_cosine_idx
  ON product_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
