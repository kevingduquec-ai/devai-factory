-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "sender_is_admin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "read_by_org" BOOLEAN NOT NULL DEFAULT false,
    "read_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_messages_org_id_created_at_idx" ON "support_messages"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as every other org_id
-- table (see migration 20260902025444_rls_policies). The admin side always
-- reads/writes through bypassRls(), so this only fences off the org-facing
-- (TenantPrismaService) side.
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_messages"
  USING (app_bypass_rls() OR org_id = app_current_org_id())
  WITH CHECK (app_bypass_rls() OR org_id = app_current_org_id());
