-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('jira', 'clickup');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('active', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('in_progress', 'completed', 'completed_with_errors', 'failed');

-- CreateEnum
CREATE TYPE "SyncSourceType" AS ENUM ('full_study', 'single_story');

-- CreateEnum
CREATE TYPE "SyncItemType" AS ENUM ('epic', 'user_story', 'test_case');

-- CreateEnum
CREATE TYPE "SyncItemStatus" AS ENUM ('created', 'failed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "integrations_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "site_url" TEXT,
    "auth_email" TEXT,
    "encrypted_token" TEXT NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'active',
    "target_id" TEXT,
    "target_label" TEXT,
    "structure_snapshot" JSONB,
    "mapping" JSONB,
    "mapping_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_type" "SyncSourceType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,
    "triggered_by" TEXT NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_items" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "item_type" "SyncItemType" NOT NULL,
    "internal_code" TEXT NOT NULL,
    "internal_title" TEXT NOT NULL,
    "external_id" TEXT,
    "external_url" TEXT,
    "status" "SyncItemStatus" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_org_id_idx" ON "integration_connections"("org_id");

-- CreateIndex
CREATE INDEX "sync_runs_org_id_started_at_idx" ON "sync_runs"("org_id", "started_at");

-- CreateIndex
CREATE INDEX "sync_runs_connection_id_idx" ON "sync_runs"("connection_id");

-- CreateIndex
CREATE INDEX "sync_runs_project_id_idx" ON "sync_runs"("project_id");

-- CreateIndex
CREATE INDEX "sync_items_sync_run_id_idx" ON "sync_items"("sync_run_id");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as every other table
-- (see migration 20260902025444_rls_policies). integration_connections and
-- sync_runs have a direct org_id column; sync_items is scoped indirectly
-- through sync_run_id -> sync_runs.org_id, same style as acceptance_criteria
-- -> user_stories -> projects. The admin side always reads/writes through
-- bypassRls(); this only fences off the org-facing (TenantPrismaService) side.
ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_connections"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sync_runs"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "sync_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sync_items"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "sync_runs" sr WHERE sr.id = "sync_items".sync_run_id AND sr.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "sync_runs" sr WHERE sr.id = "sync_items".sync_run_id AND sr.org_id = app_current_org_id()
  ));
