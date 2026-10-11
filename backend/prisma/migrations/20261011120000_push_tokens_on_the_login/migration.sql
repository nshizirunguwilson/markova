-- A phone receives push notifications for a login, not for one school record.
-- Step 3, part 4 of docs/MULTI-SCHOOL-DESIGN.md.
--
-- A parent at two schools has one phone. Registered against a school record,
-- it heard only from the school that happened to be open when the app last
-- started. Registered against the login, it hears from all of them.

ALTER TABLE "push_tokens" ADD COLUMN "account_id" TEXT;
UPDATE "push_tokens" p SET "account_id" = u."account_id"
    FROM "users" u WHERE u."id" = p."user_id";
DELETE FROM "push_tokens" WHERE "account_id" IS NULL;
ALTER TABLE "push_tokens" ALTER COLUMN "account_id" SET NOT NULL;

ALTER TABLE "push_tokens" DROP CONSTRAINT "push_tokens_user_id_fkey";
DROP INDEX "push_tokens_user_id_idx";
ALTER TABLE "push_tokens" DROP COLUMN "user_id";

ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "push_tokens_account_id_idx" ON "push_tokens"("account_id");
