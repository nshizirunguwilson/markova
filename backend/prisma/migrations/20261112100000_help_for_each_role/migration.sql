-- Who a help question is for. Empty means everyone.
ALTER TABLE "faq_articles"
  ADD COLUMN "audience" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];

-- The two questions every install started with were written for parents and
-- shown to all ten roles. They are now shown to parents.
UPDATE "faq_articles"
   SET "audience" = ARRAY['PARENT']::"Role"[]
 WHERE "title" IN ('How to check my child''s marks?', 'How to report an absence?')
   AND cardinality("audience") = 0;
