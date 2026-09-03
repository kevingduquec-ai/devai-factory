import { notFound } from "next/navigation";
import Link from "next/link";
import type { QaModuleDetailDto } from "@devai-factory/shared-types";
import { apiFetch } from "@/lib/api";
import { requireActiveSubscription } from "@/lib/session";
import { QaModuleDetail } from "./qa-module-detail";

export default async function QaModuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSubscription();
  const currentUser = session.users.find((u) => u.id === session.currentUserId);
  if (!currentUser?.qaAutomationEnabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted">Esta función no está disponible en tu cuenta.</p>
      </div>
    );
  }

  const { id } = await params;
  const res = await apiFetch(`/qa/modules/${id}`);
  if (res.status === 404) {
    notFound();
  }
  const detail: QaModuleDetailDto = await res.json();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/qa" className="text-sm text-muted hover:underline">
        ← QA-AI
      </Link>
      <QaModuleDetail initialDetail={detail} />
    </div>
  );
}
