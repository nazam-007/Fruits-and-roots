-- Keep existing featured flags intact; they remain the source for legacy badges.
-- Reusable product tags start empty and are managed independently.
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (
    length(btrim(name)) BETWEEN 1 AND 50
  ),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_ci_uidx
  ON public.tags (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.product_tags (
  product_id text NOT NULL
    REFERENCES public.products (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL
    REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS product_tags_tag_id_idx
  ON public.product_tags (tag_id);
