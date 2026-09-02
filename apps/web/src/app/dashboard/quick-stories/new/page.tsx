import Link from "next/link";
import { requireActiveSubscription } from "@/lib/session";
import { NewQuickStoryForm } from "./new-quick-story-form";

export default async function NewQuickStoryPage() {
  const session = await requireActiveSubscription();
  const currentUser = session.users.find((u) => u.id === session.currentUserId);
  const canUseSingleStory = currentUser?.singleStoryEnabled ?? true;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard/quick-stories" className="text-sm text-muted hover:underline">
          ← Historia de usuario
        </Link>
        <h1 className="font-heading mt-2 text-xl font-bold">Nueva historia de usuario</h1>
        <p className="text-sm text-muted">
          Dale un título y describe una necesidad puntual — la IA genera una sola historia de usuario detallada
          con sus criterios de aceptación. Más rápido que el análisis completo, sin preguntas de aclaración.
        </p>
      </div>

      {canUseSingleStory ? (
        <NewQuickStoryForm />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Un administrador desactivó tu acceso a este módulo. Contacta al equipo de Qubit si crees que es un error.
        </p>
      )}
    </div>
  );
}
