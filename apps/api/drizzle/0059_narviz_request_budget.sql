-- The API replicas sharing this database also share Narviz's request budget.
CREATE TABLE narviz_request_budget (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  units integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  CONSTRAINT narviz_request_budget_kind_units_check CHECK (
    (kind = 'request' AND units BETWEEN 1 AND 120)
    OR (kind IN ('download', 'cooldown') AND units = 0)
  )
);

CREATE UNIQUE INDEX narviz_request_budget_cooldown_key
  ON narviz_request_budget (kind) WHERE kind = 'cooldown';
