-- One reviewed copy per SKU and sales variant; reads never invoke a model.
CREATE TABLE ecommerce_descriptions (
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 variant_key text NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 PRIMARY KEY (product_id, variant_key)
);
-- Reverse (manual): DROP TABLE ecommerce_descriptions; destroys approved copy and needs a backup.
