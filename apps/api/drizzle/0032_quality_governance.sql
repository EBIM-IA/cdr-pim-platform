-- Durable human review: preserve all candidates/rejections and never merge SKU identities.
-- Reverse: DROP TABLE quality_review_items; (destroys review history).
CREATE TABLE quality_review_items (
 id UUID PRIMARY KEY,
 kind TEXT NOT NULL CHECK (kind IN ('attribute','commercial','duplicate')),
 status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','changes_requested')),
 product_id UUID NOT NULL REFERENCES products(id),
 version INTEGER NOT NULL CHECK (version > 0),
 data JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX quality_review_items_queue_idx ON quality_review_items(kind, status, created_at);
CREATE INDEX quality_review_items_product_idx ON quality_review_items(product_id);
-- Re-running duplicate detection must not reopen a previously decided pair.
CREATE UNIQUE INDEX quality_review_items_duplicate_pair_uidx
 ON quality_review_items(product_id, (data->'productB'->>'id')) WHERE kind = 'duplicate';
