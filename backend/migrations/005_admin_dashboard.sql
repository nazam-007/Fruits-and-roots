CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash char(64) PRIMARY KEY,
  admin_id varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON public.admin_sessions (expires_at);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS verified_by varchar(120),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_transaction_reference varchar(120);

CREATE UNIQUE INDEX IF NOT EXISTS payments_verified_reference_uidx
  ON public.payments (verified_transaction_reference)
  WHERE verified_transaction_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
  ON public.orders (order_status, created_at DESC);
