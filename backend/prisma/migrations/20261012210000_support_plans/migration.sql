-- A support plan for a student with special educational needs (B7 in
-- docs/STUDENT-LIFE-DESIGN.md): what they need, and what is done for them in
-- tests and exams.

-- CreateEnum
CREATE TYPE "SupportNeed" AS ENUM ('SEEING', 'HEARING', 'MOVING', 'LEARNING', 'SPEECH', 'LONG_TERM_ILLNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportArrangement" AS ENUM ('EXTRA_TIME', 'READER', 'SCRIBE', 'LARGE_PRINT', 'BRAILLE', 'SIGN_LANGUAGE', 'SEPARATE_ROOM', 'REST_BREAKS', 'NEAR_THE_FRONT', 'USE_A_COMPUTER');

-- CreateTable
CREATE TABLE "support_plans" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text),
    "student_id" TEXT NOT NULL,
    "needs" "SupportNeed"[],
    "need_note" TEXT,
    "arrangements" "SupportArrangement"[],
    "extra_time_percent" INTEGER,
    "other_arrangement" TEXT,
    "review_on" DATE,
    "agreed_with" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_plans_student_id_key" ON "support_plans"("student_id");

-- CreateIndex
CREATE INDEX "support_plans_school_id_idx" ON "support_plans"("school_id");

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inside the wall between schools, and a family sees only its own child's:
-- the same two rules as every table that holds a child's record.
ALTER TABLE "support_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_plans" FORCE ROW LEVEL SECURITY;
CREATE POLICY support_plans_own ON "support_plans"
  USING (app_may_see_student(student_id));
CREATE POLICY school_wall ON "support_plans" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

-- The new links stay inside a school.
SELECT app_install_same_school_checks();
