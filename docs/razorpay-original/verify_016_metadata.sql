-- READ-ONLY verification proposal; use one independently pinned original-project connection.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
SELECT current_user,current_database(),current_setting('transaction_read_only') AS read_only;
-- Client must STOP unless reviewed role/database and read_only=on; verify TLS separately.
SELECT column_name,data_type,character_maximum_length,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='payments'
 AND column_name IN ('razorpay_order_id','razorpay_payment_id','razorpay_key_id',
                    'razorpay_amount_paise','razorpay_last_status') ORDER BY column_name;
SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.payments'::regclass
 AND conname IN ('payments_source_check','payments_razorpay_test_binding_check') ORDER BY conname;
SELECT i.relname,x.indisunique,x.indisvalid,pg_get_indexdef(i.oid) AS definition
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
WHERE x.indrelid='public.payments'::regclass
 AND i.relname IN ('payments_razorpay_order_uidx','payments_razorpay_payment_uidx') ORDER BY i.relname;
ROLLBACK;
-- Expect five NULLABLE columns, no defaults; varchar lengths 100/100/100/30 and bigint amount.
-- Two validated checks; source includes DEMO/MANUAL_UPI/RAZORPAY_TEST; binding requires
-- non-null test key/order/amount, test prefix and positive amount. Two valid unique partial indexes.
