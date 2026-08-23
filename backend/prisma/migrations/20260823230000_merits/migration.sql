-- A conduct system with only deductions teaches a student that the best
-- possible outcome is to be unnoticed. Merits give the school a way to say the
-- opposite, and give a student on a warning a visible way back.
CREATE TYPE "MeritCategory" AS ENUM ('ACADEMIC_EFFORT', 'HELPING_OTHERS', 'LEADERSHIP', 'SPORT', 'ARTS', 'SERVICE', 'HONESTY', 'IMPROVEMENT');

CREATE TABLE "merit_awards" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "awarded_by_user_id" TEXT NOT NULL,
    "category" "MeritCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merit_awards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "merit_awards_student_id_idx" ON "merit_awards"("student_id");
CREATE INDEX "merit_awards_term_id_idx" ON "merit_awards"("term_id");

ALTER TABLE "merit_awards" ADD CONSTRAINT "merit_awards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merit_awards" ADD CONSTRAINT "merit_awards_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merit_awards" ADD CONSTRAINT "merit_awards_awarded_by_user_id_fkey" FOREIGN KEY ("awarded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
