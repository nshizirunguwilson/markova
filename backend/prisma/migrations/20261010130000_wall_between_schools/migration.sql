-- Many schools in one database: step 3, part 2. The wall between schools.
--
-- Every table a school owns now shows the application only the rows of the
-- school its connection names (app.school_id), and accepts only rows for that
-- school. The one way past it is app.bypass = 'on', which the application sets
-- only for deliberate platform work, such as finding who is signing in.
--
-- And the default school from part 1 is removed. A query that has not said
-- which school it is for sees nothing and can write nothing: the column's
-- default reads app.school_id, which is now unset, so an insert fails loudly
-- rather than landing in the wrong school.
--
-- The policies apply to markova_app, the role the application connects as.
-- The owner, which runs migrations and the seed, works below them, as before.
--
-- (SELECT current_setting(...)) rather than current_setting(...) so Postgres
-- reads the setting once per query, not once per row.

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I RESET app.school_id', current_database());
END
$$;

ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "academic_years" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "activities" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "activity_class_levels" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "activity_class_levels" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "activity_participants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "activity_participants" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "activity_sections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "activity_sections" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "admission_intakes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "admission_intakes" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "admission_offers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "admission_offers" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "application_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "application_documents" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "application_events" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "application_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "application_notes" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "applications" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "assessment_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "assessment_types" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
  -- RESTRICTIVE: it adds to this table's rule about whose children a parent sees.
CREATE POLICY school_wall ON "attendances" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "audit_logs" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "book_loans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "book_loans" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "books" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "class_levels" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "class_levels" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "class_sections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "class_sections" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "clinic_visits" ENABLE ROW LEVEL SECURITY;
  -- RESTRICTIVE: it adds to this table's rule about whose children a parent sees.
CREATE POLICY school_wall ON "clinic_visits" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "conversation_participants" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "conversations" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "discipline_appeals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "discipline_appeals" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "discipline_incidents" ENABLE ROW LEVEL SECURITY;
  -- RESTRICTIVE: it adds to this table's rule about whose children a parent sees.
CREATE POLICY school_wall ON "discipline_incidents" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "exam_schedules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "exam_schedules" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "faq_articles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "faq_articles" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "fee_invoice_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "fee_invoice_lines" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "fee_invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "fee_invoices" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "fee_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "fee_items" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "fee_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "fee_payments" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "fee_waivers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "fee_waivers" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "homework_submissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "homework_submissions" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "homeworks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "homeworks" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
  -- RESTRICTIVE: it adds to this table's rule about whose children a parent sees.
CREATE POLICY school_wall ON "marks" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "medication_administrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "medication_administrations" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "merit_awards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "merit_awards" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "message_mentions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "message_mentions" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "message_reads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "message_reads" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "messages" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "notifications" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "parent_students" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "parent_students" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "pocket_money_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "pocket_money_accounts" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "pocket_money_transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "pocket_money_transactions" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "report_verifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "report_verifications" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "school_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "school_configs" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "student_health_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "student_health_records" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "students" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "subjects" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "support_tickets" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "teacher_attendances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "teacher_attendances" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "teacher_roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "teacher_roles" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "teacher_subject_classes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "teacher_subject_classes" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "teachers" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "term_results" ENABLE ROW LEVEL SECURITY;
  -- RESTRICTIVE: it adds to this table's rule about whose children a parent sees.
CREATE POLICY school_wall ON "term_results" AS RESTRICTIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "terms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "terms" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "timetables" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "timetables" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "trades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "trades" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "users" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

ALTER TABLE "year_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "year_results" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');
