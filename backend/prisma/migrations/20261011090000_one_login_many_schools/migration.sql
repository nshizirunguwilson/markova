-- One login per person, one school record per school they belong to.
-- Step 3, part 3 of docs/MULTI-SCHOOL-DESIGN.md.
--
-- Today every person is one users row, holding both how they sign in and what
-- their school knows about them. This splits the two:
--
--   accounts  the login: phone or email, password, which school to open first
--   users     the school record: name, role, work, and the school's own
--             contact details for the person
--
-- Every existing users row gets an account of its own, carrying its sign in
-- details, with the same id so the link is plain to follow. Nobody's way of
-- signing in changes.

CREATE TYPE "PlatformRole" AS ENUM ('OWNER');

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "force_password_change" BOOLEAN NOT NULL DEFAULT true,
    "platform_role" "PlatformRole",
    "last_login_at" TIMESTAMP(3),
    "last_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "accounts"
    ("id", "email", "phone", "password_hash", "force_password_change",
     "last_login_at", "last_user_id", "created_at", "updated_at")
SELECT "id", "email", "phone", "password_hash", "force_password_change",
       "last_login_at", "id", "created_at", "updated_at"
FROM "users";

CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");
CREATE UNIQUE INDEX "accounts_phone_key" ON "accounts"("phone");

-- The school record points at its login.
ALTER TABLE "users" ADD COLUMN "account_id" TEXT;
UPDATE "users" SET "account_id" = "id";
ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "users_school_id_account_id_role_key"
    ON "users"("school_id", "account_id", "role");
CREATE INDEX "users_account_id_idx" ON "users"("account_id");

-- The password and the forced change now live on the login only.
ALTER TABLE "users" DROP COLUMN "password_hash";
ALTER TABLE "users" DROP COLUMN "force_password_change";

-- A school record's email and phone are the school's contact details. The
-- same person has the same ones in every school they belong to, and in two
-- records at one school (a teacher who is also a parent), so they can no
-- longer be unique. The login's are.
DROP INDEX "users_email_key";
DROP INDEX "users_phone_key";
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- A signed in device belongs to the login, and is open on one of its school
-- records at a time.
ALTER TABLE "user_sessions" ADD COLUMN "account_id" TEXT;
UPDATE "user_sessions" s SET "account_id" = u."account_id"
    FROM "users" u WHERE u."id" = s."user_id";
ALTER TABLE "user_sessions" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "user_sessions_account_id_idx" ON "user_sessions"("account_id");

-- The wall, for logins.
--
-- A login has no school of its own, so it cannot carry a school_id. Instead,
-- inside a school the application sees a login only when that school has a
-- record for it. The users table's own wall applies inside this check, so
-- "a record for it" means a record in the current school and no other.
-- Kigali Hill cannot read, change or even count the logins of people who
-- belong only to Lycee Notre Dame.
--
-- Finding a login by phone before anybody is signed in, and creating a new
-- one, happen on the platform pass (app.bypass), deliberately and by name.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_wall" ON "accounts" TO markova_app
    USING (
        (SELECT current_setting('app.bypass', true)) = 'on'
        OR EXISTS (SELECT 1 FROM "users" u WHERE u."account_id" = "accounts"."id")
    )
    WITH CHECK (
        (SELECT current_setting('app.bypass', true)) = 'on'
        OR EXISTS (SELECT 1 FROM "users" u WHERE u."account_id" = "accounts"."id")
    );
