-- A role for the application that is not a superuser.
--
-- The row level security added in the previous migration was correctly enabled
-- and did nothing, because the application connects as `markova`, which is the
-- database superuser. A superuser bypasses every policy no matter how the
-- table is configured, so the policies were real and unreachable.
--
-- That is worth fixing on its own account, separately from RLS: an application
-- that runs as a superuser can drop any table in the database, and nothing in
-- the application ever needs to.
--
-- ── The split ───────────────────────────────────────────────────────────────
--
--   markova       owns the schema, runs migrations, runs the seed
--   markova_app   what the running API connects as
--
-- Migrations keep the owner because they alter the schema. The API gets the
-- second, which can read and write rows and nothing else.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'markova_app') THEN
    -- The password is replaced per deployment. It is here so a fresh
    -- development database works without a manual step.
    CREATE ROLE markova_app LOGIN PASSWORD 'markova_app';
  END IF;
END
$$;

-- Explicitly not a superuser, and explicitly does not bypass RLS. Both are the
-- default for a new role; stating them means a later ALTER cannot quietly
-- change it without this line becoming wrong.
ALTER ROLE markova_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE markova TO markova_app;
GRANT USAGE ON SCHEMA public TO markova_app;

-- Rows, not structure. No CREATE, no DROP, no ALTER.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO markova_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO markova_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO markova_app;

-- And on whatever a later migration adds, so this does not have to be
-- remembered every time a table is created.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO markova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO markova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO markova_app;
