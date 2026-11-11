-- Search reporting uses observed successful executions, never invented historical counts.
-- Reverse: DROP TABLE search_events;
CREATE TABLE search_events (
 id uuid PRIMARY KEY,
 query text NOT NULL CHECK(length(query) BETWEEN 1 AND 300),
 result_count integer NOT NULL CHECK(result_count >= 0),
 channel text NOT NULL CHECK(channel IN ('variants','semantic')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_events_occurred_at_idx ON search_events(occurred_at);
