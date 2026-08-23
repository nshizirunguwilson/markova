-- Boarding-school roles that are real jobs, not administrators with extra
-- duties: the patron runs the boys' dormitories, the matron the girls', and
-- both hold the students' pocket money.
ALTER TYPE "Role" ADD VALUE 'PATRON';
ALTER TYPE "Role" ADD VALUE 'MATRON';
ALTER TYPE "Role" ADD VALUE 'NURSE';

-- The school holds a child's money, so this is a trust ledger: nothing is ever
-- edited or deleted, a correction is a reversing entry, and the balance is the
-- sum of the entries.
CREATE TYPE "PocketMoneyKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'REFUND', 'REVERSAL', 'ADJUSTMENT');

CREATE TABLE "pocket_money_accounts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "daily_limit" DOUBLE PRECISION,
    "low_balance_alert" DOUBLE PRECISION,
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pocket_money_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pocket_money_accounts_student_id_key" ON "pocket_money_accounts"("student_id");

CREATE TABLE "pocket_money_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" "PocketMoneyKind" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "recorded_by_user_id" TEXT,
    "reverses_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pocket_money_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pocket_money_transactions_reverses_id_key" ON "pocket_money_transactions"("reverses_id");
CREATE INDEX "pocket_money_transactions_account_id_created_at_idx" ON "pocket_money_transactions"("account_id", "created_at");

ALTER TABLE "pocket_money_accounts" ADD CONSTRAINT "pocket_money_accounts_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pocket_money_transactions" ADD CONSTRAINT "pocket_money_transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "pocket_money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pocket_money_transactions" ADD CONSTRAINT "pocket_money_transactions_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pocket_money_transactions" ADD CONSTRAINT "pocket_money_transactions_reverses_id_fkey"
  FOREIGN KEY ("reverses_id") REFERENCES "pocket_money_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
