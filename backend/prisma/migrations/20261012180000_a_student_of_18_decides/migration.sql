-- From 18 a student decides what their parents see (A8 in
-- docs/STUDENT-LIFE-DESIGN.md). Everything stays shared until they choose.
ALTER TABLE "students" ADD COLUMN "shares_results" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "students" ADD COLUMN "shares_conduct" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "students" ADD COLUMN "shares_health" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "students" ADD COLUMN "sharing_changed_at" TIMESTAMP(3);
