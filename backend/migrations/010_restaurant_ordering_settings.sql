CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  accepting_orders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO public.restaurant_settings (id, accepting_orders)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
