-- The name the sender's file had. A recipient offered "a1b2c3.pdf" does not
-- know what it is, so the original name travels beside the stored one.
ALTER TABLE "messages" ADD COLUMN "file_name" TEXT;
