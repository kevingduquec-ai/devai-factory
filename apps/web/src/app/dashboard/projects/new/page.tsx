import Link from "next/link";
import { planIncludesFullAnalysis, PLAN_LABEL_ES } from "@devai-factory/shared-types";
import { requireActiveSubscription } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const session = await requireActiveSubscription();
  const canUseFullAnalysis = planIncludesFullAnalysis(session.organization.plan);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:underline">
          ← Análisis completo
        </Link>
        <h1 className="font-heading mt-2 text-xl font-bold">Nuevo análisis completo</h1>
        <p className="text-sm text-muted">
          Describe la necesidad de software como si hablaras con un consultor. La IA hará
          preguntas de aclaración antes de generar requerimientos, historias de usuario, modelo
          de datos, API y casos de prueba.
        </p>
      </div>

      {canUseFullAnalysis ? (
        <NewProjectForm />
      ) : (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted">
            El análisis completo no está incluido en tu plan {PLAN_LABEL_ES[session.organization.plan]}. Mejora tu
            plan para desbloquearlo, o usa el módulo de historia de usuario individual mientras tanto.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard/billing">
              <Button>Ver planes</Button>
            </Link>
            <Link href="/dashboard/quick-stories/new">
              <Button variant="secondary">Historia de usuario</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
