-- Homework can be set with a file attached: the worksheet or past paper the
-- work is on. The name the teacher's file had is kept apart from the uuid
-- the file is stored under.
ALTER TABLE "homeworks"
  ADD COLUMN "file_url" TEXT,
  ADD COLUMN "file_name" TEXT;
