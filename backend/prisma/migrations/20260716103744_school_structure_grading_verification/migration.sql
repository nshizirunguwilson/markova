-- CreateEnum
CREATE TYPE "EducationStage" AS ENUM ('O_LEVEL', 'A_LEVEL');

-- CreateEnum
CREATE TYPE "SubjectScope" AS ENUM ('O_CORE', 'O_ELECTIVE', 'A_GENERAL', 'A_SPECIFIC');

-- DropIndex
DROP INDEX "class_sections_class_level_id_name_key";

-- DropIndex
DROP INDEX "subjects_name_key";

-- AlterTable
ALTER TABLE "class_levels" ADD COLUMN     "stage" "EducationStage" NOT NULL DEFAULT 'O_LEVEL';

-- AlterTable
ALTER TABLE "class_sections" ADD COLUMN     "trade_id" TEXT;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "class_level_id" TEXT,
ADD COLUMN     "scope" "SubjectScope" NOT NULL DEFAULT 'O_CORE',
ADD COLUMN     "trade_id" TEXT;

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "aggregate" INTEGER,
ADD COLUMN     "aggregate_max" INTEGER;

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_verifications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "term_result_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trades_code_key" ON "trades"("code");

-- CreateIndex
CREATE UNIQUE INDEX "trades_name_key" ON "trades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "report_verifications_code_key" ON "report_verifications"("code");

-- CreateIndex
CREATE UNIQUE INDEX "report_verifications_term_result_id_key" ON "report_verifications"("term_result_id");

-- CreateIndex
CREATE INDEX "class_sections_trade_id_idx" ON "class_sections"("trade_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_sections_class_level_id_trade_id_name_key" ON "class_sections"("class_level_id", "trade_id", "name");

-- CreateIndex
CREATE INDEX "subjects_trade_id_idx" ON "subjects"("trade_id");

-- CreateIndex
CREATE INDEX "subjects_class_level_id_idx" ON "subjects"("class_level_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_trade_id_key" ON "subjects"("name", "trade_id");

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_verifications" ADD CONSTRAINT "report_verifications_term_result_id_fkey" FOREIGN KEY ("term_result_id") REFERENCES "term_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

