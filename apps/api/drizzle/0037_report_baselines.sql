-- Immutable observation cuts: historical values are captured from real PIM state, never demo data.
-- Reverse: DROP TABLE report_baseline_products; DROP TABLE report_baselines;
CREATE TABLE report_baselines (
  id uuid PRIMARY KEY,
  label text NOT NULL,
  actor_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  product_count integer NOT NULL CHECK(product_count >= 0)
);
CREATE TABLE report_baseline_products (
  baseline_id uuid NOT NULL REFERENCES report_baselines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  applications integer NOT NULL CHECK(applications >= 0),
  oem integer NOT NULL CHECK(oem >= 0),
  homologs integer NOT NULL CHECK(homologs >= 0),
  attributes integer NOT NULL CHECK(attributes >= 0),
  PRIMARY KEY(baseline_id,product_id)
);
