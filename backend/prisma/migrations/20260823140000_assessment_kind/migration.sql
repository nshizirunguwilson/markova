-- Homework, assignments, quizzes, tests and projects are the same thing with a
-- different name and weight. Everything already recorded is homework.
CREATE TYPE "AssessmentKind" AS ENUM ('HOMEWORK', 'ASSIGNMENT', 'QUIZ', 'TEST', 'PROJECT', 'PRACTICAL');

ALTER TABLE "homeworks" ADD COLUMN "kind" "AssessmentKind" NOT NULL DEFAULT 'HOMEWORK';
