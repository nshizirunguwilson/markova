-- Conduct cannot stand above the school's full mark.
--
-- Two ways it did. Points given back when an incident was struck out or an
-- appeal upheld were added with no ceiling, so a student who had already made
-- the points up with merits ended above a clean sheet. And the column still
-- defaulted to 100, from before conduct was marked out of 40, so any student
-- created without naming it started at 100 in a school whose full mark is 40.
--
-- The report card printed the full mark and the transfer letter the raw
-- figure, so the two documents disagreed about the same child.

ALTER TABLE "students" ALTER COLUMN "discipline_points" SET DEFAULT 40;

-- Each student is brought down to their own school's full mark, which is the
-- school's `starting_discipline_points` setting, or 40 where none is set.
UPDATE "students" s
SET "discipline_points" = full_mark.value
FROM (
  SELECT sc."id" AS school_id,
         COALESCE(
           (SELECT NULLIF(c."value", '')::int
              FROM "school_configs" c
             WHERE c."school_id" = sc."id"
               AND c."key" = 'starting_discipline_points'
               AND c."value" ~ '^[0-9]+$'
             LIMIT 1),
           40
         ) AS value
  FROM "schools" sc
) full_mark
WHERE s."school_id" = full_mark.school_id
  AND s."discipline_points" > full_mark.value;
