-- =============================================================================
-- 0021 — Durable inbound inbox for Sismetic / Dynamics AX product batches
-- =============================================================================
-- The customer confirmed that this integration is one-way: AX sends product information
-- and the PIM receives it. These tables preserve the validated input and its transport
-- metadata without yet deciding how AX fields overwrite the master catalog.
-- =============================================================================

CREATE TABLE ax_inbound_batches (
  id                 uuid        PRIMARY KEY,
  external_batch_id  text        NOT NULL,
  sent_at            timestamptz NOT NULL,
  source_system      text,
  request_hash       text        NOT NULL,
  status             text        NOT NULL DEFAULT 'received',
  record_count       integer     NOT NULL,
  correlation_id     text        NOT NULL,
  received_at        timestamptz NOT NULL,

  CONSTRAINT ax_inbound_batches_external_id_not_blank
    CHECK (length(btrim(external_batch_id)) > 0),
  CONSTRAINT ax_inbound_batches_request_hash_format
    CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT ax_inbound_batches_status_allowed
    CHECK (status IN ('received')),
  CONSTRAINT ax_inbound_batches_record_count_positive
    CHECK (record_count > 0)
);

CREATE UNIQUE INDEX ax_inbound_batches_external_id_key
  ON ax_inbound_batches (external_batch_id);
CREATE INDEX ax_inbound_batches_received_at_idx
  ON ax_inbound_batches (received_at DESC);

CREATE TABLE ax_inbound_records (
  id                  uuid        PRIMARY KEY,
  batch_id            uuid        NOT NULL REFERENCES ax_inbound_batches (id) ON DELETE CASCADE,
  row_number          integer     NOT NULL,
  item_code           text        NOT NULL,
  supplier_code       text        NOT NULL,
  source_modified_at  timestamptz,
  payload             jsonb       NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ax_inbound_records_row_number_positive CHECK (row_number > 0),
  CONSTRAINT ax_inbound_records_item_code_not_blank CHECK (length(btrim(item_code)) > 0),
  CONSTRAINT ax_inbound_records_supplier_code_not_blank CHECK (length(btrim(supplier_code)) > 0),
  CONSTRAINT ax_inbound_records_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX ax_inbound_records_batch_row_key
  ON ax_inbound_records (batch_id, row_number);
CREATE INDEX ax_inbound_records_item_code_idx
  ON ax_inbound_records (item_code);
