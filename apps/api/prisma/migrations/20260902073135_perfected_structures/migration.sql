-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('draft', 'approved', 'implemented', 'obsolete');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('not_executed', 'passed', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "TestCaseSeverity" AS ENUM ('alta', 'media', 'baja');

-- AlterEnum
ALTER TYPE "TestCaseType" ADD VALUE 'regression';
ALTER TYPE "TestCaseType" ADD VALUE 'performance';

-- AlterTable
ALTER TABLE "acceptance_criteria" ADD COLUMN     "scenario_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "acceptance_criteria" ALTER COLUMN "scenario_name" DROP DEFAULT;

-- AlterTable
ALTER TABLE "requirements" ADD COLUMN     "acceptance_criteria" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "actor" TEXT,
ADD COLUMN     "assumptions" TEXT,
ADD COLUMN     "business_rules" TEXT,
ADD COLUMN     "dependencies" TEXT,
ADD COLUMN     "status" "RequirementStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '1.0';

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "actual_result" TEXT,
ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "precondition" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "severity" "TestCaseSeverity" NOT NULL DEFAULT 'media',
ADD COLUMN     "status" "TestCaseStatus" NOT NULL DEFAULT 'not_executed',
ADD COLUMN     "test_data" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "test_cases" ALTER COLUMN "code" DROP DEFAULT;
ALTER TABLE "test_cases" ALTER COLUMN "title" DROP DEFAULT;
ALTER TABLE "test_cases" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_stories" ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "definition_of_done" TEXT,
ADD COLUMN     "definition_of_ready" TEXT,
ADD COLUMN     "dependencies" TEXT,
ADD COLUMN     "priority" "RequirementPriority",
ADD COLUMN     "story_points" INTEGER,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "user_stories" ALTER COLUMN "code" DROP DEFAULT;
ALTER TABLE "user_stories" ALTER COLUMN "title" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_project_id_code_key" ON "test_cases"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "user_stories_project_id_code_key" ON "user_stories"("project_id", "code");
