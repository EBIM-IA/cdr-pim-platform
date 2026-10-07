CREATE TABLE code_affixes (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  token text NOT NULL,
  meaning text NOT NULL,
  attribute text,
  implied_value text,
  brand text,
  family text,
  source text NOT NULL,
  confidence numeric(4, 3),
  status text NOT NULL DEFAULT 'draft',
  evidence text,
  bore_rule text NOT NULL DEFAULT 'none',
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  validated_by text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT code_affixes_kind_check
    CHECK (kind IN ('prefix', 'series', 'suffix', 'pattern')),
  CONSTRAINT code_affixes_source_check
    CHECK (source IN ('manual', 'manufacturer', 'standard', 'import', 'ai_suggestion')),
  CONSTRAINT code_affixes_status_check
    CHECK (status IN ('draft', 'pending_validation', 'validated', 'rejected')),
  CONSTRAINT code_affixes_bore_rule_check CHECK (bore_rule IN ('none', 'iso_15')),
  CONSTRAINT code_affixes_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT code_affixes_priority_check CHECK (priority >= 0 AND priority <= 1000),
  CONSTRAINT code_affixes_iso_rule_check CHECK (bore_rule = 'none' OR kind = 'series'),
  CONSTRAINT code_affixes_token_check CHECK (char_length(btrim(token)) BETWEEN 1 AND 200),
  CONSTRAINT code_affixes_meaning_check CHECK (char_length(btrim(meaning)) BETWEEN 1 AND 1000),
  CONSTRAINT code_affixes_validated_evidence_check CHECK (
    status <> 'validated'
    OR (
      evidence IS NOT NULL
      AND char_length(btrim(evidence)) > 0
      AND validated_by IS NOT NULL
      AND validated_at IS NOT NULL
    )
  )
);

CREATE INDEX code_affixes_list_idx
  ON code_affixes (active, status, kind, priority DESC, token);

CREATE UNIQUE INDEX code_affixes_active_identity_key
  ON code_affixes (
    kind,
    upper(token),
    coalesce(upper(brand), ''),
    coalesce(upper(family), '')
  )
  WHERE active;

-- Deliberately no seed data: manufacturer/standard evidence must be reviewed before a rule
-- can become `validated`, and the parser only consumes validated persisted rules.
