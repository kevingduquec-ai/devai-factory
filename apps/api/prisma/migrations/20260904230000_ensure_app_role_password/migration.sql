-- Re-syncs devai_app's password on every deploy.
--
-- The previous migration only sets this password inside a `CREATE ROLE ...
-- IF NOT EXISTS` block, so it only ever takes effect the first time the
-- role is created. If a managed Postgres (Railway's plugin, for one) ends
-- up with the role already present but with a different or unknown
-- password — e.g. from a deploy that got interrupted after role creation
-- but before the app ever connected — DATABASE_APP_URL's password stops
-- matching and PrismaService fails every request with "Authentication
-- failed against database server ... for `devai_app` are not valid",
-- indistinguishable from a real credentials typo. ALTER ROLE unconditionally
-- here makes the password authoritative from migrations, not from whatever
-- history the role happens to have.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'devai_app') THEN
    ALTER ROLE devai_app WITH LOGIN PASSWORD 'PMR0800j5_sN_-BShGAH8B8x' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
