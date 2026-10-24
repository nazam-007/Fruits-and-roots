ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_hash char(64),
  ADD COLUMN IF NOT EXISTS tracking_token_hash char(64);

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON orders (idempotency_key);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items (order_id);

CREATE INDEX IF NOT EXISTS payments_order_id_idx
  ON payments (order_id);
