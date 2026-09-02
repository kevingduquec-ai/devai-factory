import { redirect } from "next/navigation";
import type { AdminSupportConversationDto } from "@devai-factory/shared-types";
import { adminApiFetch } from "@/lib/admin-api";
import { SupportInbox } from "./support-inbox";

export default async function AdminSupportPage() {
  const res = await adminApiFetch("/admin/support/conversations");
  if (res.status === 401) {
    redirect("/admin/login");
  }
  const conversations: AdminSupportConversationDto[] = res.ok ? await res.json() : [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h1 className="font-heading text-xl font-bold">Soporte</h1>
        <p className="text-sm text-muted">
          Conversaciones iniciadas por cualquier organización, en cualquier plan. Solo el super-admin puede
          responder — cualquier persona de esa organización ve la respuesta en su chat.
        </p>
      </div>
      <SupportInbox initialConversations={conversations} />
    </div>
  );
}
