-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "stories_only" BOOLEAN NOT NULL DEFAULT false;

