-- A school's week is not only lessons: visiting day, clubs, matches and trips
-- all live in a paper diary today. A trip off the premises needs recorded
-- consent, and a club that never takes a register quietly stops existing.
CREATE TYPE "ActivityKind" AS ENUM ('CLUB', 'SPORT', 'ASSEMBLY', 'TRIP', 'VISITING_DAY', 'SCHOOL_EVENT');
CREATE TYPE "ActivityAudience" AS ENUM ('WHOLE_SCHOOL', 'LEVELS', 'CLASSES');
CREATE TYPE "ConsentState" AS ENUM ('PENDING', 'GIVEN', 'REFUSED');

CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "audience" "ActivityAudience" NOT NULL DEFAULT 'WHOLE_SCHOOL',
    "requires_consent" BOOLEAN NOT NULL DEFAULT false,
    "tracks_attendance" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "term_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activities_starts_at_idx" ON "activities"("starts_at");

CREATE TABLE "activity_class_levels" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "class_level_id" TEXT NOT NULL,
    CONSTRAINT "activity_class_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_class_levels_activity_id_class_level_id_key" ON "activity_class_levels"("activity_id", "class_level_id");

CREATE TABLE "activity_sections" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    CONSTRAINT "activity_sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_sections_activity_id_class_section_id_key" ON "activity_sections"("activity_id", "class_section_id");

CREATE TABLE "activity_participants" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "consent" "ConsentState" NOT NULL DEFAULT 'PENDING',
    "consent_by_user_id" TEXT,
    "consent_at" TIMESTAMP(3),
    "consent_note" TEXT,
    "attended" BOOLEAN,
    "attended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_participants_activity_id_student_id_key" ON "activity_participants"("activity_id", "student_id");
CREATE INDEX "activity_participants_student_id_idx" ON "activity_participants"("student_id");

ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_class_levels" ADD CONSTRAINT "activity_class_levels_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_class_levels" ADD CONSTRAINT "activity_class_levels_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_sections" ADD CONSTRAINT "activity_sections_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_sections" ADD CONSTRAINT "activity_sections_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_consent_by_user_id_fkey" FOREIGN KEY ("consent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
