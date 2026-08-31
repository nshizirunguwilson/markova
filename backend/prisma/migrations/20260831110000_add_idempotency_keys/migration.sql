-- Idempotency keys on the two tables that move money.
--
-- A parent on a poor connection taps pay, sees nothing happen, and taps again;
-- a client that times out retries. Both produce two records of one payment,
-- and the second is only found when somebody reconciles the books.
--
-- Nullable, so every row that already exists stays valid and a caller that
-- does not send a key still works. Unique, so the database refuses a duplicate
-- even when two requests arrive at the same instant on two different servers,
-- which an application-level check cannot do.

ALTER TABLE "fee_payments" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "pocket_money_transactions" ADD COLUMN "idempotency_key" TEXT;

-- Postgres treats NULLs as distinct in a unique index, so the many rows
-- without a key do not collide with each other.
CREATE UNIQUE INDEX "fee_payments_idempotency_key_key"
  ON "fee_payments"("idempotency_key");
CREATE UNIQUE INDEX "pocket_money_transactions_idempotency_key_key"
  ON "pocket_money_transactions"("idempotency_key");
