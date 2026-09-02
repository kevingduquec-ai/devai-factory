-- CreateTable
CREATE TABLE "support_conversations" (
    "org_id" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("org_id")
);

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as support_messages —
-- the org side can only ever see its own row, the admin side always reads
-- through bypassRls().
ALTER TABLE "support_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_conversations"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());
