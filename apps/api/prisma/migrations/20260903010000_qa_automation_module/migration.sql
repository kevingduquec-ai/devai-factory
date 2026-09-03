-- CreateEnum
CREATE TYPE "QaScopeMode" AS ENUM ('scoped', 'full');

-- CreateEnum
CREATE TYPE "QaTestCaseStatus" AS ENUM ('draft', 'blocked_missing_data', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "QaRunStatus" AS ENUM ('in_progress', 'passed', 'failed', 'error');

-- CreateEnum
CREATE TYPE "QaStepAction" AS ENUM ('goto', 'click', 'fill', 'select', 'wait_for_text', 'assert_text', 'assert_url', 'assert_element_visible');

-- CreateEnum
CREATE TYPE "QaMissingDataKind" AS ENUM ('secret', 'business');

-- CreateEnum
CREATE TYPE "QaMissingDataStatus" AS ENUM ('pending', 'resolved');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "qa_automation_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "qa_test_modules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "scope_mode" "QaScopeMode" NOT NULL DEFAULT 'scoped',
    "description" TEXT NOT NULL,
    "setup_steps" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qa_test_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_test_cases" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "TestCaseSeverity" NOT NULL DEFAULT 'media',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "expected_result" TEXT NOT NULL,
    "status" "QaTestCaseStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qa_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_missing_data_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "test_case_id" TEXT NOT NULL,
    "kind" "QaMissingDataKind" NOT NULL,
    "field_key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "QaMissingDataStatus" NOT NULL DEFAULT 'pending',
    "encrypted_value" TEXT,
    "business_value" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "responded_by" TEXT,
    "first_used_run_id" TEXT,

    CONSTRAINT "qa_missing_data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_test_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "status" "QaRunStatus" NOT NULL DEFAULT 'in_progress',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "triggered_by" TEXT NOT NULL,
    "report_file" TEXT,

    CONSTRAINT "qa_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_test_run_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "test_case_id" TEXT NOT NULL,
    "status" "QaRunStatus" NOT NULL,
    "error_message" TEXT,
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "qa_test_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qa_test_modules_org_id_idx" ON "qa_test_modules"("org_id");

-- CreateIndex
CREATE INDEX "qa_test_cases_module_id_idx" ON "qa_test_cases"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "qa_test_cases_module_id_code_key" ON "qa_test_cases"("module_id", "code");

-- CreateIndex
CREATE INDEX "qa_missing_data_requests_test_case_id_idx" ON "qa_missing_data_requests"("test_case_id");

-- CreateIndex
CREATE INDEX "qa_missing_data_requests_org_id_status_idx" ON "qa_missing_data_requests"("org_id", "status");

-- CreateIndex
CREATE INDEX "qa_test_runs_org_id_started_at_idx" ON "qa_test_runs"("org_id", "started_at");

-- CreateIndex
CREATE INDEX "qa_test_runs_module_id_idx" ON "qa_test_runs"("module_id");

-- CreateIndex
CREATE INDEX "qa_test_run_items_run_id_idx" ON "qa_test_run_items"("run_id");

-- AddForeignKey
ALTER TABLE "qa_test_modules" ADD CONSTRAINT "qa_test_modules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_test_cases" ADD CONSTRAINT "qa_test_cases_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "qa_test_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_missing_data_requests" ADD CONSTRAINT "qa_missing_data_requests_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "qa_test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_test_runs" ADD CONSTRAINT "qa_test_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_test_runs" ADD CONSTRAINT "qa_test_runs_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "qa_test_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_test_run_items" ADD CONSTRAINT "qa_test_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "qa_test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_test_run_items" ADD CONSTRAINT "qa_test_run_items_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "qa_test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as every other table
-- (see migration 20260902025444_rls_policies). qa_test_modules,
-- qa_test_cases, qa_missing_data_requests and qa_test_runs have a direct
-- org_id column; qa_test_run_items is scoped indirectly through run_id ->
-- qa_test_runs.org_id, same style as sync_items -> sync_runs.
ALTER TABLE "qa_test_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qa_test_modules" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qa_test_modules"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "qa_test_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qa_test_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qa_test_cases"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "qa_missing_data_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qa_missing_data_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qa_missing_data_requests"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "qa_test_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qa_test_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qa_test_runs"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());

ALTER TABLE "qa_test_run_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qa_test_run_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qa_test_run_items"
  USING (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "qa_test_runs" r WHERE r.id = "qa_test_run_items".run_id AND r.org_id = app_current_org_id()
  ))
  WITH CHECK (app_bypass_rls() OR EXISTS (
    SELECT 1 FROM "qa_test_runs" r WHERE r.id = "qa_test_run_items".run_id AND r.org_id = app_current_org_id()
  ));
