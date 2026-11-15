-- PROPOSAL ONLY — NOT EXECUTED. Separate explicit approval of this exact file required.
-- Proposed target: original mrjsfznxbwjsdzyuzvsi ONLY, independently verified by
-- project-qualified endpoint/login and certificate-validated TLS BEFORE execution.
-- current_database/current_user alone cannot identify a Supabase project.
-- No changes to retained testing project wznkpgpexjexxzptuuwp.
-- Do not blindly replay backend/migrations/016 (originally isolated-test proposal).
-- Normal backend runs expiry writes: separately approve pausing it before review/apply.
-- Requires existing 000–015-equivalent payment/order schema; no record backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Refuse a partial/already-applied schema; inspect rather than hide differences.
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Unexpected reviewed migration identity'; END IF;
 IF to_regclass('public.payments') IS NULL THEN RAISE EXCEPTION 'Missing payments table'; END IF;
 IF EXISTS (SELECT 1 FROM pg_attribute
  WHERE attrelid='public.payments'::regclass AND NOT attisdropped
  AND attname IN ('razorpay_order_id','razorpay_payment_id','razorpay_key_id',
                 'razorpay_amount_paise','razorpay_last_status')) THEN
  RAISE EXCEPTION 'Razorpay schema already/partially present; stop for drift review'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid='public.payments'::regclass AND conname='payments_source_check'
  AND contype='c' AND convalidated) THEN
  RAISE EXCEPTION 'Expected validated payment-source constraint missing'; END IF;
END $$;

ALTER TABLE public.payments
  ADD COLUMN razorpay_order_id varchar(100),
  ADD COLUMN razorpay_payment_id varchar(100),
  ADD COLUMN razorpay_key_id varchar(100),
  ADD COLUMN razorpay_amount_paise bigint,
  ADD COLUMN razorpay_last_status varchar(30);
ALTER TABLE public.payments DROP CONSTRAINT payments_source_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_source_check
  CHECK (payment_source IN ('DEMO','MANUAL_UPI','RAZORPAY_TEST'));
ALTER TABLE public.payments ADD CONSTRAINT payments_razorpay_test_binding_check CHECK (
  payment_source <> 'RAZORPAY_TEST' OR
  (razorpay_order_id IS NOT NULL AND razorpay_key_id IS NOT NULL
   AND left(razorpay_key_id,9) = 'rzp_test_'
   AND razorpay_amount_paise IS NOT NULL AND razorpay_amount_paise > 0)
);
CREATE UNIQUE INDEX payments_razorpay_order_uidx ON public.payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
CREATE UNIQUE INDEX payments_razorpay_payment_uidx ON public.payments(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
-- Current inspected postgres owner can access new columns. No role/ACL/RLS change.
-- Future least-privilege runtime access requires a separate grants/RLS review.
COMMIT;
