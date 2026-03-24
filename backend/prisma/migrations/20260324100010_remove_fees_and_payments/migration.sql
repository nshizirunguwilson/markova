-- DropForeignKey
ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "payment_transactions_fee_record_id_fkey";
ALTER TABLE "fee_records" DROP CONSTRAINT IF EXISTS "fee_records_student_id_fkey";
ALTER TABLE "fee_records" DROP CONSTRAINT IF EXISTS "fee_records_academic_year_id_fkey";
ALTER TABLE "fee_records" DROP CONSTRAINT IF EXISTS "fee_records_term_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "payment_transactions";
DROP TABLE IF EXISTS "fee_records";

-- DropEnum
DROP TYPE IF EXISTS "FeeStatus";
DROP TYPE IF EXISTS "PaymentMethod";
