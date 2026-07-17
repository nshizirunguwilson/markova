-- CreateEnum
CREATE TYPE "TeacherQualification" AS ENUM ('A0', 'A1', 'A2');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "cell" TEXT,
ADD COLUMN     "disability" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "father_name" TEXT,
ADD COLUMN     "insurance_number" TEXT,
ADD COLUMN     "is_boarder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mother_name" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "village" TEXT;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "hire_date" TIMESTAMP(3),
ADD COLUMN     "qualification" "TeacherQualification",
ADD COLUMN     "rssb_number" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "national_id" TEXT,
ADD COLUMN     "nationality" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_national_id_key" ON "users"("national_id");

