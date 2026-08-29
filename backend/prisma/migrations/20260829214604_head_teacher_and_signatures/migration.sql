-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HEAD_TEACHER';

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "dos_confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dos_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "dos_confirmed_by_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signature_url" TEXT;

-- AddForeignKey
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_dos_confirmed_by_id_fkey" FOREIGN KEY ("dos_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
