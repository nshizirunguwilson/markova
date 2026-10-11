-- A student's journey (docs/STUDENT-LIFE-DESIGN.md, B8 and A9): suspensions
-- and time away as dated pauses, every change of standing kept as history,
-- and the day a person passed away.

-- CreateEnum
CREATE TYPE "PauseKind" AS ENUM ('SUSPENDED', 'AWAY');

-- CreateEnum
CREATE TYPE "JourneyStep" AS ENUM ('SUSPENDED', 'AWAY', 'BACK', 'WITHDRAWN', 'EXPELLED', 'TRANSFERRED', 'GRADUATED', 'PASSED_AWAY', 'READMITTED');

-- A student's standing. INACTIVE meant "left, reason unknown", which is what
-- WITHDRAWN says. Renamed in place, so every student keeps their value.
ALTER TYPE "StudentStatus" RENAME VALUE 'INACTIVE' TO 'WITHDRAWN';
ALTER TYPE "StudentStatus" ADD VALUE 'EXPELLED';
ALTER TYPE "StudentStatus" ADD VALUE 'PASSED_AWAY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passed_away_on" DATE;

-- CreateTable
CREATE TABLE "student_pauses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text),
    "student_id" TEXT NOT NULL,
    "kind" "PauseKind" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "discipline_incident_id" TEXT,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_journey" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text),
    "student_id" TEXT NOT NULL,
    "step" "JourneyStep" NOT NULL,
    "happened_on" DATE NOT NULL,
    "until" DATE,
    "reason" TEXT,
    "note" TEXT,
    "class_section_id" TEXT,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_journey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_pauses_student_id_starts_on_idx" ON "student_pauses"("student_id", "starts_on");

-- CreateIndex
CREATE INDEX "student_pauses_school_id_idx" ON "student_pauses"("school_id");

-- CreateIndex
CREATE INDEX "student_journey_student_id_happened_on_idx" ON "student_journey"("student_id", "happened_on");

-- CreateIndex
CREATE INDEX "student_journey_school_id_idx" ON "student_journey"("school_id");

-- AddForeignKey
ALTER TABLE "student_pauses" ADD CONSTRAINT "student_pauses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pauses" ADD CONSTRAINT "student_pauses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pauses" ADD CONSTRAINT "student_pauses_discipline_incident_id_fkey" FOREIGN KEY ("discipline_incident_id") REFERENCES "discipline_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pauses" ADD CONSTRAINT "student_pauses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_journey" ADD CONSTRAINT "student_journey_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_journey" ADD CONSTRAINT "student_journey_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_journey" ADD CONSTRAINT "student_journey_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_journey" ADD CONSTRAINT "student_journey_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inside the wall between schools, and a family sees only its own child: the
-- same two rules as every other table that holds a child's record.
ALTER TABLE "student_pauses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_pauses" FORCE ROW LEVEL SECURITY;
CREATE POLICY student_pauses_own ON "student_pauses"
  USING (app_may_see_student(student_id));
CREATE POLICY school_wall ON "student_pauses" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "student_journey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_journey" FORCE ROW LEVEL SECURITY;
CREATE POLICY student_journey_own ON "student_journey"
  USING (app_may_see_student(student_id));
CREATE POLICY school_wall ON "student_journey" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

-- The new links stay inside a school.
SELECT app_install_same_school_checks();
