-- CreateEnum
CREATE TYPE "PhotoAnswer" AS ENUM ('YES', 'NO', 'NOT_ASKED');

-- CreateEnum
CREATE TYPE "ConsentHow" AS ENUM ('IN_THE_APP', 'PAPER_FORM', 'ADMISSION_FORM');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "photo_for_id" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED',
ADD COLUMN     "photo_in_app" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED',
ADD COLUMN     "photo_publicity" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED';

-- CreateTable
CREATE TABLE "photo_consent_records" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text),
    "student_id" TEXT NOT NULL,
    "for_id" "PhotoAnswer" NOT NULL,
    "in_app" "PhotoAnswer" NOT NULL,
    "publicity" "PhotoAnswer" NOT NULL,
    "how" "ConsentHow" NOT NULL,
    "answered_by" TEXT NOT NULL,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_consent_records_student_id_created_at_idx" ON "photo_consent_records"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "photo_consent_records_school_id_idx" ON "photo_consent_records"("school_id");

-- AddForeignKey
ALTER TABLE "photo_consent_records" ADD CONSTRAINT "photo_consent_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_consent_records" ADD CONSTRAINT "photo_consent_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_consent_records" ADD CONSTRAINT "photo_consent_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Inside the wall between schools, and a family sees only its own child's:
-- the same two rules as every table that holds a child's record.
ALTER TABLE "photo_consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_consent_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY photo_consent_records_own ON "photo_consent_records"
  USING (app_may_see_student(student_id));
CREATE POLICY school_wall ON "photo_consent_records" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

-- The new links stay inside a school.
SELECT app_install_same_school_checks();
