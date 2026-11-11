-- Until now an excused absence was an absence that carried a reason. The
-- ones recorded as sick, a family matter or with permission become excused
-- days, so they stop counting against the child; an absence with no reason
-- is marked as what it was.
UPDATE "attendances"
   SET "status" = 'EXCUSED'
 WHERE "status" = 'ABSENT'
   AND "reason_category" IN ('SICK', 'FAMILY', 'PERMISSION');

UPDATE "attendances"
   SET "reason_category" = 'UNEXCUSED'
 WHERE "status" = 'ABSENT'
   AND "reason_category" IS NULL;

-- Present and late never had a reason to carry.
UPDATE "attendances"
   SET "reason_category" = NULL
 WHERE "status" IN ('PRESENT', 'LATE')
   AND "reason_category" IS NOT NULL;
