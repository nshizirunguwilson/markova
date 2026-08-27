-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "calculated_at" TIMESTAMP(3),
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "report_card_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "report_card_published_at" TIMESTAMP(3);

-- Before this change "published" meant everything was visible, report card
-- included. Anything already published keeps that, so no student loses a
-- document they could see yesterday. The timestamp is left null rather than
-- invented: we know it was published, not when.
UPDATE "term_results"
SET "report_card_published" = true
WHERE "is_published" = true;
