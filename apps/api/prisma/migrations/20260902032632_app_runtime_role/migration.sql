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
--
-- The database name and owner-role name below are NEVER hardcoded to the
-- local Docker setup ('devai_factory' / 'devai') — a managed Postgres (ej.
-- el que da Railway) usa nombres distintos, y GRANT CONNECT ON DATABASE
-- <nombre literal que no existe> revienta con un error duro que aborta el
-- resto del deploy. current_database() y current_user (el rol que
-- literalmente está corriendo `prisma migrate deploy`, siempre el dueño
-- real de las tablas que se acaban de crear) resuelven al valor correcto
-- sin importar el entorno — por eso van dentro de EXECUTE format(), la
-- única forma de usarlos como identificador dinámico en un GRANT/ALTER.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'devai_app') THEN
    CREATE ROLE devai_app WITH LOGIN PASSWORD 'PMR0800j5_sN_-BShGAH8B8x' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO devai_app', current_database());
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO devai_app', current_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO devai_app', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO devai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO devai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO devai_app;