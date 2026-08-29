-- CreateEnum
CREATE TYPE "AdmissionEntryPoint" AS ENUM ('SENIOR_ONE', 'ADVANCED_LEVEL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'WAITLISTED', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AdmissionDocumentKind" AS ENUM ('BIRTH_CERTIFICATE', 'NATIONAL_EXAM_RESULT', 'PREVIOUS_REPORT_CARD', 'TRANSFER_LETTER', 'PASSPORT_PHOTO', 'PARENT_ID', 'MEDICAL_FORM', 'INSURANCE_CARD', 'BURSARY_LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "AdmissionFunding" AS ENUM ('FAMILY', 'DISTRICT_BURSARY', 'GOVERNMENT_SPONSORED', 'NGO_SPONSOR', 'FARG', 'STAFF_CHILD');

-- CreateTable
CREATE TABLE "admission_intakes" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "class_level_id" TEXT NOT NULL,
    "entry_point" "AdmissionEntryPoint" NOT NULL,
    "name" TEXT NOT NULL,
    "places" INTEGER NOT NULL,
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "intake_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT,
    "national_id" TEXT,
    "province" TEXT,
    "district" TEXT,
    "sector" TEXT,
    "cell" TEXT,
    "village" TEXT,
    "previous_school" TEXT,
    "exam_mark" DOUBLE PRECISION,
    "exam_total" DOUBLE PRECISION,
    "trade_id" TEXT,
    "second_choice_trade_id" TEXT,
    "is_boarder" BOOLEAN NOT NULL DEFAULT false,
    "funding" "AdmissionFunding" NOT NULL DEFAULT 'FAMILY',
    "funding_detail" TEXT,
    "blood_type" TEXT,
    "allergies" TEXT,
    "medical_conditions" TEXT,
    "disability" TEXT,
    "insurance_number" TEXT,
    "religion" TEXT,
    "guardian_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "guardian_email" TEXT,
    "guardian_national_id" TEXT,
    "guardian_relation" TEXT NOT NULL,
    "second_guardian_name" TEXT,
    "second_guardian_phone" TEXT,
    "note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "kind" "AdmissionDocumentKind" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "reason" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_offers" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    "is_boarder" BOOLEAN NOT NULL DEFAULT false,
    "term_fee" DOUBLE PRECISION,
    "conditions" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "offered_by_user_id" TEXT NOT NULL,
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "admission_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admission_intakes_is_open_idx" ON "admission_intakes"("is_open");

-- CreateIndex
CREATE UNIQUE INDEX "admission_intakes_academic_year_id_class_level_id_entry_poi_key" ON "admission_intakes"("academic_year_id", "class_level_id", "entry_point");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "applications_student_id_key" ON "applications"("student_id");

-- CreateIndex
CREATE INDEX "applications_intake_id_status_idx" ON "applications"("intake_id", "status");

-- CreateIndex
CREATE INDEX "applications_status_submitted_at_idx" ON "applications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "applications_guardian_phone_idx" ON "applications"("guardian_phone");

-- CreateIndex
CREATE INDEX "application_documents_application_id_idx" ON "application_documents"("application_id");

-- CreateIndex
CREATE INDEX "application_events_application_id_created_at_idx" ON "application_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "application_notes_application_id_created_at_idx" ON "application_notes"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "admission_offers_application_id_idx" ON "admission_offers"("application_id");

-- CreateIndex
CREATE INDEX "admission_offers_expires_at_idx" ON "admission_offers"("expires_at");

-- AddForeignKey
ALTER TABLE "admission_intakes" ADD CONSTRAINT "admission_intakes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_intakes" ADD CONSTRAINT "admission_intakes_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "admission_intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_second_choice_trade_id_fkey" FOREIGN KEY ("second_choice_trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_offered_by_user_id_fkey" FOREIGN KEY ("offered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
