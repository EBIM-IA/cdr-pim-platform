-- Record human requests independently of ERP-owned equivalence membership. No delivery or
-- group mutation is implied until an AX contract exists and an actual PUSH is received.
CREATE TABLE unified_code_requests (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  current_code text,
  action text NOT NULL CHECK (action IN ('remove','move','correct')),
  proposed_code text,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'pending_dispatch' CHECK (status = 'pending_dispatch'),
  requested_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action = 'remove' OR (proposed_code IS NOT NULL AND length(btrim(proposed_code)) > 0))
);
CREATE INDEX unified_code_requests_sku_created_idx ON unified_code_requests (sku, created_at);
-- Reverse (destructive; only before requests exist): DROP TABLE unified_code_requests;
