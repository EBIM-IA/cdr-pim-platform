-- Private, durable editing drafts: saving a draft never changes catalog values or publication.
-- Empty entries retain the version so an old browser cannot resurrect a discarded draft.
CREATE TABLE product_attribute_drafts (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  template_id uuid NOT NULL REFERENCES attribute_templates(id),
  entries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(entries) = 'array'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, actor_id)
);
