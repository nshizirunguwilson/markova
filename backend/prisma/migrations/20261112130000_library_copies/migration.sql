-- Each physical copy of a book becomes a record of its own, so the school
-- can say which copy a student is holding. The book keeps its quantity and
-- availableCount as counters over these.

-- CreateEnum
CREATE TYPE "CopyStanding" AS ENUM ('ON_THE_SHELF', 'LOST', 'DAMAGED', 'RETIRED');

-- CreateTable
CREATE TABLE "book_copies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT current_setting('app.school_id'::text),
    "book_id" TEXT NOT NULL,
    "copy_number" INTEGER NOT NULL,
    "standing" "CopyStanding" NOT NULL DEFAULT 'ON_THE_SHELF',

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_book_id_copy_number_key" ON "book_copies"("book_id", "copy_number");

-- CreateIndex
CREATE INDEX "book_copies_school_id_idx" ON "book_copies"("school_id");

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which copy a loan put out.
ALTER TABLE "book_loans" ADD COLUMN "copy_id" TEXT;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "book_copies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inside the wall between schools, the same policy as "books" itself.
ALTER TABLE "book_copies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_wall ON "book_copies" AS PERMISSIVE TO markova_app
  USING (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on')
  WITH CHECK (school_id = (SELECT current_setting('app.school_id', true)) OR (SELECT current_setting('app.bypass', true)) = 'on');

-- The new links stay inside a school.
SELECT app_install_same_school_checks();

-- ── The copies every existing book already has ──────────────────────────────
-- Each book's quantity becomes that many numbered copies.
INSERT INTO "book_copies" ("id", "school_id", "book_id", "copy_number")
SELECT gen_random_uuid(), b."school_id", b."id", gs.n
  FROM "books" b
  CROSS JOIN LATERAL generate_series(1, GREATEST(b."quantity", 0)) AS gs(n);

-- Each open loan is holding one of them: hand out the lowest-numbered free
-- copies in the order the loans were made.
WITH open_loans AS (
  SELECT l."id", l."book_id",
         ROW_NUMBER() OVER (PARTITION BY l."book_id" ORDER BY l."checked_out_at") AS nth
    FROM "book_loans" l
   WHERE l."status" IN ('ACTIVE', 'OVERDUE')
)
UPDATE "book_loans" l
   SET "copy_id" = c."id"
  FROM open_loans o
  JOIN "book_copies" c
    ON c."book_id" = o."book_id" AND c."copy_number" = o."nth"
 WHERE l."id" = o."id";

-- A copy out on a lost or damaged loan is not on the shelf. Quantity was
-- already reduced for these in some schools and not in others, so no copy
-- rows are invented for them; the ones with no free copy left stay unlinked,
-- exactly as unknowable as they were.
WITH gone AS (
  SELECT l."id" AS loan_id, l."book_id", l."status",
         ROW_NUMBER() OVER (PARTITION BY l."book_id" ORDER BY l."checked_out_at") AS nth
    FROM "book_loans" l
   WHERE l."status" IN ('LOST', 'DAMAGED') AND l."copy_id" IS NULL
),
free_copies AS (
  SELECT c."id", c."book_id",
         ROW_NUMBER() OVER (PARTITION BY c."book_id" ORDER BY c."copy_number" DESC) AS nth
    FROM "book_copies" c
   WHERE c."standing" = 'ON_THE_SHELF'
     AND NOT EXISTS (SELECT 1 FROM "book_loans" l2 WHERE l2."copy_id" = c."id")
)
UPDATE "book_loans" l
   SET "copy_id" = f."id"
  FROM gone g
  JOIN free_copies f ON f."book_id" = g."book_id" AND f."nth" = g."nth"
 WHERE l."id" = g."loan_id";

UPDATE "book_copies" c
   SET "standing" = CASE l."status" WHEN 'LOST' THEN 'LOST'::"CopyStanding" ELSE 'DAMAGED'::"CopyStanding" END
  FROM "book_loans" l
 WHERE l."copy_id" = c."id" AND l."status" IN ('LOST', 'DAMAGED');
