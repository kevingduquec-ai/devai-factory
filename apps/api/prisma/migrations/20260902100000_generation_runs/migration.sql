-- CreateTable
CREATE TABLE "generation_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_runs_org_id_created_at_idx" ON "generation_runs"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

