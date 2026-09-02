-- Runtime application role, separate from the migration/owner role.
--
-- The role that owns these tables (set via DATABASE_URL, used by `prisma
-- migrate`) is typically a Postgres superuser in local/dev setups (e.g. the
-- default POSTGRES_USER in the official postgres Docker image) or otherwise
-- has BYPASSRLS. Superusers and BYPASSRLS roles always skip Row-Level
-- Security, no matter how many `FORCE ROW LEVEL SECURITY` policies exist —
-- so the running API must NEVER connect as the owner, or the RLS migration
-- (see rls_policies) silently does nothing.
--
-- This role has no ownership, no BYPASSRLS, no SUPERUSER — only DML on the
-- application tables — so RLS actually applies to it. Point the app's
-- DATABASE_APP_URL at this role; keep DATABASE_URL (the owner) for `prisma
-- migrate` only. See PrismaService, which connects with DATABASE_APP_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'devai_app') THEN
    CREATE ROLE devai_app WITH LOGIN PASSWORD 'PMR0800j5_sN_-BShGAH8B8x' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE devai_factory TO devai_app;
GRANT USAGE ON SCHEMA public TO devai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO devai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO devai_app;

-- So future migrations (new tables/sequences) stay accessible to devai_app
-- without a manual GRANT each time.
ALTER DEFAULT PRIVILEGES FOR ROLE devai IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO devai_app;
ALTER DEFAULT PRIVILEGES FOR ROLE devai IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO devai_app;