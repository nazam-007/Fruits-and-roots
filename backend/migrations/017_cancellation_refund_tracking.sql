
-- Fruits & Roots - Migration 017
-- Cancellation and manual refund tracking
-- TARGET: Original Supabase project mrjsfznxbwjsdzyuzvsi
-- REVIEW BEFORE EXECUTION
-- Requires existing migrations 000-016.
-- No historical backfill or automatic money movement.
-- Before execution: independently confirm project/endpoint, recoverable backup,
-- and that the Express backend/payment-expiry worker are stopped.
-- These comments and current_database() cannot verify Supabase project identity.
-- Run the complete file as one transaction only after separate execution approval.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Reject an already or partially applied migration.
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'Missing payments table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('verified_at'), ('verified_by'),
                 ('reconciliation_required')) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS existing
      WHERE existing.table_schema = 'public'
        AND existing.table_name = 'payments'
        AND existing.column_name = required.column_name
    )
  ) THEN
    RAISE EXCEPTION 'Missing required payment-verification columns; inspect schema';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name IN (
        'refund_status',
        'refund_due_paise',
        'refund_requested_at',
        'refund_reference',
        'refund_amount_paise',
        'refund_completed_at',
        'refund_recorded_at',
        'refund_recorded_by',
        'refund_evidence_note'
      )
  ) THEN
    RAISE EXCEPTION
      'Migration 017 already or partially applied; inspect schema';
  END IF;
END $$;

-- 2. Add refund-tracking columns.
ALTER TABLE public.payments
  ADD COLUMN refund_status varchar(20)
    NOT NULL DEFAULT 'NONE',
  ADD COLUMN refund_due_paise bigint,
  ADD COLUMN refund_requested_at timestamptz,
  ADD COLUMN refund_reference varchar(120),
  ADD COLUMN refund_amount_paise bigint,
  ADD COLUMN refund_completed_at timestamptz,
  ADD COLUMN refund_recorded_at timestamptz,
  ADD COLUMN refund_recorded_by varchar(120),
  ADD COLUMN refund_evidence_note text;

-- 3. Validate refund state and required metadata.
-- IS TRUE prevents nullable expressions from
-- bypassing the CHECK constraint.

ALTER TABLE public.payments
ADD CONSTRAINT payments_refund_tracking_check
CHECK ((
  (
    refund_status = 'NONE'
    AND refund_due_paise IS NULL
    AND refund_requested_at IS NULL
    AND refund_reference IS NULL
    AND refund_amount_paise IS NULL
    AND refund_completed_at IS NULL
    AND refund_recorded_at IS NULL
    AND refund_recorded_by IS NULL
    AND refund_evidence_note IS NULL
  )
  OR
  (
    refund_status IN ('PENDING', 'COMPLETED')
    AND payment_status = 'PAID'
    AND payment_source IN (
      'MANUAL_UPI',
      'RAZORPAY_TEST'
    )
    AND verified_at IS NOT NULL
    AND verified_by IS NOT NULL
    AND reconciliation_required IS FALSE
    AND refund_due_paise IS NOT NULL
    AND refund_due_paise > 0
    AND refund_requested_at IS NOT NULL
    AND (
      (
        refund_status = 'PENDING'
        AND refund_reference IS NULL
        AND refund_amount_paise IS NULL
        AND refund_completed_at IS NULL
        AND refund_recorded_at IS NULL
        AND refund_recorded_by IS NULL
        AND refund_evidence_note IS NULL
      )
      OR
      (
        refund_status = 'COMPLETED'
        AND refund_reference IS NOT NULL
        AND length(btrim(refund_reference))
          BETWEEN 4 AND 120
        AND refund_amount_paise IS NOT NULL
        AND refund_amount_paise = refund_due_paise
        AND refund_completed_at IS NOT NULL
        AND refund_completed_at >= refund_requested_at
        AND refund_recorded_at IS NOT NULL
        AND refund_recorded_at >= refund_completed_at
        AND refund_recorded_by IS NOT NULL
        AND length(btrim(refund_recorded_by))
          BETWEEN 1 AND 120
        AND refund_evidence_note IS NOT NULL
        AND length(btrim(refund_evidence_note))
          BETWEEN 10 AND 500
      )
    )
  )
) IS TRUE);

-- 4. Prevent duplicate refund references.
CREATE UNIQUE INDEX payments_refund_reference_uidx
ON public.payments (refund_reference)
WHERE refund_reference IS NOT NULL;

COMMIT;
