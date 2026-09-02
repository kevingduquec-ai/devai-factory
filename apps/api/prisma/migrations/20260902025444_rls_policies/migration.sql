-- Row-Level Security: second lock on tenant isolation, enforced by Postgres
-- itself so a bug in application code (a missing `where: { orgId }`) cannot
-- leak another organization's rows. The app sets `app.current_org_id` (or
-- `app.bypass_rls`) per-transaction — see apps/api/src/common/prisma-rls.ts.
--
-- FORCE ROW LEVEL SECURITY is required on every table because the app
-- connects as the same role that owns the tables (table owners bypass RLS
-- by default). Revisit this if a dedicated non-owner runtime role is
-- introduced later.

-- ids are Prisma default String/uuid() columns, stored as `text`, not the
-- native `uuid` type, so this returns text to compare directly against them.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), 'off') = 'on'
$$ LANGUAGE sql STABLE;

-- organizations: scoped by its own id
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations"
  USING (app_bypass_rls() OR id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR id = app_current_org_id());

-- tables with a direct org_id column
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "projects"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_events"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

-- tables scoped indirectly through project_id -> projects.org_id
ALTER TABLE "intake_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intake_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "intake_sessions"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "intake_sessions".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "intake_sessions".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requirements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "requirements"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "requirements".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "requirements".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "user_stories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_stories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_stories"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "user_stories".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "user_stories".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "data_model_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_model_entities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "data_model_entities"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "data_model_entities".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "data_model_entities".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "api_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_endpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "api_endpoints"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "api_endpoints".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "api_endpoints".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "test_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "test_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "test_cases"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "test_cases".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "test_cases".project_id AND p.org_id = app_current_org_id()
  ));

ALTER TABLE "documents_exported" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents_exported" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "documents_exported"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "documents_exported".project_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "projects" p WHERE p.id = "documents_exported".project_id AND p.org_id = app_current_org_id()
  ));

-- acceptance_criteria: scoped through user_stories -> projects
ALTER TABLE "acceptance_criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance_criteria" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "acceptance_criteria"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "user_stories" us
    JOIN "projects" p ON p.id = us.project_id
    WHERE us.id = "acceptance_criteria".user_story_id AND p.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "user_stories" us
    JOIN "projects" p ON p.id = us.project_id
    WHERE us.id = "acceptance_criteria".user_story_id AND p.org_id = app_current_org_id()
  ));
