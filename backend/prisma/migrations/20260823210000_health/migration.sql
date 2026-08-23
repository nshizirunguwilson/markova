-- A boarding school is responsible for a child's body as well as their marks.
-- The sick bay runs on an exercise book today, so nobody can answer "how many
-- times has she been in this term" or "did she already have her paracetamol",
-- and a parent learns their child was ill when they come to collect them.
CREATE TYPE "ClinicVisitOutcome" AS ENUM ('RETURNED_TO_CLASS', 'RESTING_IN_SICK_BAY', 'REFERRED_OUT', 'SENT_HOME');
CREATE TYPE "ClinicSeverity" AS ENUM ('MINOR', 'MODERATE', 'SERIOUS');

CREATE TABLE "clinic_visits" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "findings" TEXT,
    "treatment" TEXT,
    "severity" "ClinicSeverity" NOT NULL DEFAULT 'MINOR',
    "outcome" "ClinicVisitOutcome" NOT NULL DEFAULT 'RETURNED_TO_CLASS',
    "temperature" DOUBLE PRECISION,
    "referred_to" TEXT,
    "seen_by_user_id" TEXT NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discharged_at" TIMESTAMP(3),
    "parent_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clinic_visits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinic_visits_student_id_idx" ON "clinic_visits"("student_id");
CREATE INDEX "clinic_visits_visited_at_idx" ON "clinic_visits"("visited_at");

CREATE TABLE "medication_administrations" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "medicine" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "reason" TEXT,
    "given_by_user_id" TEXT NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "medication_administrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "medication_administrations_student_id_idx" ON "medication_administrations"("student_id");
CREATE INDEX "medication_administrations_given_at_idx" ON "medication_administrations"("given_at");

CREATE TABLE "student_health_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "chronic_conditions" TEXT,
    "regular_medication" TEXT,
    "allergy_notes" TEXT,
    "emergency_plan" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "emergency_relationship" TEXT,
    "insurance_provider" TEXT,
    "insurance_number" TEXT,
    "preferred_clinic" TEXT,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_health_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_health_records_student_id_key" ON "student_health_records"("student_id");

ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_seen_by_user_id_fkey" FOREIGN KEY ("seen_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "clinic_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_given_by_user_id_fkey" FOREIGN KEY ("given_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_health_records" ADD CONSTRAINT "student_health_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_health_records" ADD CONSTRAINT "student_health_records_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
