-- Share approved client formats between browsers; column order remains personal per actor.
-- Reverse: DROP TABLE report_preferences;
CREATE TABLE report_preferences (
  actor_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('layout','format')),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,kind,key)
);
