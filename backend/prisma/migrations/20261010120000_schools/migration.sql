-- Many schools in one database: step 3, part 1.
--
-- Adds the schools table and a school_id to every table a school owns, and
-- makes every rule that was "unique" (a class name, a student number, an ISBN,
-- a receipt number) unique within a school instead of across all of them.
-- See docs/MULTI-SCHOOL-DESIGN.md.
--
-- Today's data becomes the first school. Nothing in the application has to
-- change for this: a new row takes its school from the connection setting
-- app.school_id, and this migration makes the first school that setting's
-- default for every connection. Part 2 of step 3 removes the default and sets
-- the school for each request instead, so a query that has not said which
-- school it is for gets nothing.

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- The first school, named from its own settings, made the default for this
-- session (so the columns below fill existing rows) and for every later one.
DO $$
DECLARE
  school_id   TEXT := gen_random_uuid()::text;
  school_name TEXT := COALESCE(
    (SELECT value FROM school_configs WHERE key = 'school_name' LIMIT 1),
    'Markova Academy'
  );
  school_slug TEXT := trim(both '-' from regexp_replace(lower(school_name), '[^a-z0-9]+', '-', 'g'));
BEGIN
  INSERT INTO schools (id, name, slug, updated_at)
    VALUES (school_id, school_name, school_slug, CURRENT_TIMESTAMP);
  PERFORM set_config('app.school_id', school_id, false);
  EXECUTE format('ALTER DATABASE %I SET app.school_id = %L', current_database(), school_id);
END
$$;

-- DropIndex
DROP INDEX "academic_years_name_key";

-- DropIndex
DROP INDEX "assessment_types_name_key";

-- DropIndex
DROP INDEX "books_barcode_key";

-- DropIndex
DROP INDEX "books_isbn_key";

-- DropIndex
DROP INDEX "class_levels_name_key";

-- DropIndex
DROP INDEX "fee_payments_receipt_number_key";

-- DropIndex
DROP INDEX "school_configs_key_key";

-- DropIndex
DROP INDEX "students_nfc_card_id_key";

-- DropIndex
DROP INDEX "students_student_id_number_key";

-- DropIndex
DROP INDEX "subjects_name_trade_id_key";

-- DropIndex
DROP INDEX "trades_code_key";

-- DropIndex
DROP INDEX "trades_name_key";

-- DropIndex
DROP INDEX "users_code_key";

-- DropIndex
DROP INDEX "users_national_id_key";

-- AlterTable
ALTER TABLE "academic_years" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "activity_class_levels" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "activity_participants" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "activity_sections" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "admission_intakes" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "admission_offers" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "application_documents" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "application_events" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "application_notes" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "assessment_types" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "school_id" TEXT DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "book_loans" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "class_levels" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "class_sections" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "clinic_visits" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "discipline_appeals" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "discipline_incidents" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "exam_schedules" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "faq_articles" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "fee_invoice_lines" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "fee_invoices" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "fee_items" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "fee_payments" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "fee_waivers" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "homeworks" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "marks" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "medication_administrations" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "merit_awards" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "message_mentions" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "message_reads" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "parent_students" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "pocket_money_accounts" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "pocket_money_transactions" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "report_verifications" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "school_configs" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "student_health_records" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "teacher_attendances" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "teacher_roles" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "teacher_subject_classes" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "terms" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "timetables" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);

-- AlterTable
ALTER TABLE "year_results" ADD COLUMN     "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text);



-- CreateIndex
CREATE UNIQUE INDEX "academic_years_school_id_name_key" ON "academic_years"("school_id", "name");

-- CreateIndex
CREATE INDEX "activities_school_id_idx" ON "activities"("school_id");

-- CreateIndex
CREATE INDEX "activity_class_levels_school_id_idx" ON "activity_class_levels"("school_id");

-- CreateIndex
CREATE INDEX "activity_participants_school_id_idx" ON "activity_participants"("school_id");

-- CreateIndex
CREATE INDEX "activity_sections_school_id_idx" ON "activity_sections"("school_id");

-- CreateIndex
CREATE INDEX "admission_intakes_school_id_idx" ON "admission_intakes"("school_id");

-- CreateIndex
CREATE INDEX "admission_offers_school_id_idx" ON "admission_offers"("school_id");

-- CreateIndex
CREATE INDEX "application_documents_school_id_idx" ON "application_documents"("school_id");

-- CreateIndex
CREATE INDEX "application_events_school_id_idx" ON "application_events"("school_id");

-- CreateIndex
CREATE INDEX "application_notes_school_id_idx" ON "application_notes"("school_id");

-- CreateIndex
CREATE INDEX "applications_school_id_idx" ON "applications"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_school_id_name_key" ON "assessment_types"("school_id", "name");

-- CreateIndex
CREATE INDEX "attendances_school_id_idx" ON "attendances"("school_id");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_idx" ON "audit_logs"("school_id");

-- CreateIndex
CREATE INDEX "book_loans_school_id_idx" ON "book_loans"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "books_school_id_isbn_key" ON "books"("school_id", "isbn");

-- CreateIndex
CREATE UNIQUE INDEX "books_school_id_barcode_key" ON "books"("school_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "class_levels_school_id_name_key" ON "class_levels"("school_id", "name");

-- CreateIndex
CREATE INDEX "class_sections_school_id_idx" ON "class_sections"("school_id");

-- CreateIndex
CREATE INDEX "clinic_visits_school_id_idx" ON "clinic_visits"("school_id");

-- CreateIndex
CREATE INDEX "conversation_participants_school_id_idx" ON "conversation_participants"("school_id");

-- CreateIndex
CREATE INDEX "conversations_school_id_idx" ON "conversations"("school_id");

-- CreateIndex
CREATE INDEX "discipline_appeals_school_id_idx" ON "discipline_appeals"("school_id");

-- CreateIndex
CREATE INDEX "discipline_incidents_school_id_idx" ON "discipline_incidents"("school_id");

-- CreateIndex
CREATE INDEX "exam_schedules_school_id_idx" ON "exam_schedules"("school_id");

-- CreateIndex
CREATE INDEX "faq_articles_school_id_idx" ON "faq_articles"("school_id");

-- CreateIndex
CREATE INDEX "fee_invoice_lines_school_id_idx" ON "fee_invoice_lines"("school_id");

-- CreateIndex
CREATE INDEX "fee_invoices_school_id_idx" ON "fee_invoices"("school_id");

-- CreateIndex
CREATE INDEX "fee_items_school_id_idx" ON "fee_items"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_school_id_receipt_number_key" ON "fee_payments"("school_id", "receipt_number");

-- CreateIndex
CREATE INDEX "fee_waivers_school_id_idx" ON "fee_waivers"("school_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_idx" ON "homework_submissions"("school_id");

-- CreateIndex
CREATE INDEX "homeworks_school_id_idx" ON "homeworks"("school_id");

-- CreateIndex
CREATE INDEX "marks_school_id_idx" ON "marks"("school_id");

-- CreateIndex
CREATE INDEX "medication_administrations_school_id_idx" ON "medication_administrations"("school_id");

-- CreateIndex
CREATE INDEX "merit_awards_school_id_idx" ON "merit_awards"("school_id");

-- CreateIndex
CREATE INDEX "message_mentions_school_id_idx" ON "message_mentions"("school_id");

-- CreateIndex
CREATE INDEX "message_reads_school_id_idx" ON "message_reads"("school_id");

-- CreateIndex
CREATE INDEX "messages_school_id_idx" ON "messages"("school_id");

-- CreateIndex
CREATE INDEX "notifications_school_id_idx" ON "notifications"("school_id");

-- CreateIndex
CREATE INDEX "parent_students_school_id_idx" ON "parent_students"("school_id");

-- CreateIndex
CREATE INDEX "pocket_money_accounts_school_id_idx" ON "pocket_money_accounts"("school_id");

-- CreateIndex
CREATE INDEX "pocket_money_transactions_school_id_idx" ON "pocket_money_transactions"("school_id");

-- CreateIndex
CREATE INDEX "report_verifications_school_id_idx" ON "report_verifications"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_configs_school_id_key_key" ON "school_configs"("school_id", "key");

-- CreateIndex
CREATE INDEX "student_health_records_school_id_idx" ON "student_health_records"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_student_id_number_key" ON "students"("school_id", "student_id_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_nfc_card_id_key" ON "students"("school_id", "nfc_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_name_trade_id_key" ON "subjects"("school_id", "name", "trade_id");

-- CreateIndex
CREATE INDEX "support_tickets_school_id_idx" ON "support_tickets"("school_id");

-- CreateIndex
CREATE INDEX "teacher_attendances_school_id_idx" ON "teacher_attendances"("school_id");

-- CreateIndex
CREATE INDEX "teacher_roles_school_id_idx" ON "teacher_roles"("school_id");

-- CreateIndex
CREATE INDEX "teacher_subject_classes_school_id_idx" ON "teacher_subject_classes"("school_id");

-- CreateIndex
CREATE INDEX "teachers_school_id_idx" ON "teachers"("school_id");

-- CreateIndex
CREATE INDEX "term_results_school_id_idx" ON "term_results"("school_id");

-- CreateIndex
CREATE INDEX "terms_school_id_idx" ON "terms"("school_id");

-- CreateIndex
CREATE INDEX "timetables_school_id_idx" ON "timetables"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "trades_school_id_code_key" ON "trades"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "trades_school_id_name_key" ON "trades"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_code_key" ON "users"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_national_id_key" ON "users"("school_id", "national_id");

-- CreateIndex
CREATE INDEX "year_results_school_id_idx" ON "year_results"("school_id");

-- AddForeignKey
ALTER TABLE "school_configs" ADD CONSTRAINT "school_configs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_types" ADD CONSTRAINT "assessment_types_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_roles" ADD CONSTRAINT "teacher_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_classes" ADD CONSTRAINT "teacher_subject_classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_verifications" ADD CONSTRAINT "report_verifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_results" ADD CONSTRAINT "year_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_incidents" ADD CONSTRAINT "discipline_incidents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_appeals" ADD CONSTRAINT "discipline_appeals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_articles" ADD CONSTRAINT "faq_articles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_money_accounts" ADD CONSTRAINT "pocket_money_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_money_transactions" ADD CONSTRAINT "pocket_money_transactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_class_levels" ADD CONSTRAINT "activity_class_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sections" ADD CONSTRAINT "activity_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_health_records" ADD CONSTRAINT "student_health_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merit_awards" ADD CONSTRAINT "merit_awards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_intakes" ADD CONSTRAINT "admission_intakes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

