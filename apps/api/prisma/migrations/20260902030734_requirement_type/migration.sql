-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('functional', 'non_functional');

-- AlterTable
ALTER TABLE "requirements" ADD COLUMN     "type" "RequirementType" NOT NULL DEFAULT 'functional';
