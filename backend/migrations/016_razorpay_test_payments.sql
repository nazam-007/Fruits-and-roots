-- PROPOSAL ONLY. Requires 000-015. Review and apply only to an approved isolated
-- testing database. No UPDATE/DELETE/backfill of historical financial records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
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
  (razorpay_order_id IS NOT NULL AND left(razorpay_key_id,9) = 'rzp_test_'
   AND razorpay_amount_paise IS NOT NULL AND razorpay_amount_paise > 0)
);
CREATE UNIQUE INDEX payments_razorpay_order_uidx ON public.payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
CREATE UNIQUE INDEX payments_razorpay_payment_uidx ON public.payments(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
-- Existing 014 runtime grants cover the new columns; no new table/policy needed.
COMMIT;
