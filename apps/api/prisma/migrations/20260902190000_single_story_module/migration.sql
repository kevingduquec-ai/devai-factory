-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "user_stories_only_mode";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "single_story_enabled" BOOLEAN NOT NULL DEFAULT true;
