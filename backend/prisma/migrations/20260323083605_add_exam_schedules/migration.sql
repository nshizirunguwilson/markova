-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "exam_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "syllabus" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_schedules_class_section_id_term_id_idx" ON "exam_schedules"("class_section_id", "term_id");

-- CreateIndex
CREATE INDEX "exam_schedules_exam_date_idx" ON "exam_schedules"("exam_date");

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
