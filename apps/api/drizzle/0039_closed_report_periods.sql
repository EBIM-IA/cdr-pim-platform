-- Preserve confirmed, closed client monthly totals separately from PIM observations.
-- Reverse: DROP TABLE report_closed_periods;
CREATE TABLE report_closed_periods (
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 2200),
 month integer NOT NULL CHECK(month BETWEEN 1 AND 12),
 total integer NOT NULL CHECK(total >= 0),
 source text NOT NULL,
 actor_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(year,month)
);
