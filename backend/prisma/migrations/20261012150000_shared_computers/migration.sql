-- Signing in on a shared computer (docs/STUDENT-LIFE-DESIGN.md, B5): the
-- session knows it is shared, and when the sign in began.
ALTER TABLE "user_sessions" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_sessions" ADD COLUMN "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
