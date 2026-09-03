import type { QaTestModuleSummaryDto } from "@devai-factory/shared-types";
import { apiFetch } from "@/lib/api";
import { requireActiveSubscription } from "@/lib/session";
import { QaModulesManager } from "./qa-modules-manager";

export default async function QaPage() {
  const session = await requireActiveSubscription();
  const currentUser = session.users.find((u) => u.id === session.currentUserId);

  // Igual que Integraciones: si el super-admin no activó el add-on para
  // esta persona, no se muestra ningún botón ni mención del módulo, ni
  // siquiera entrando por URL directa (el backend también bloquea cada
  // acción, ver QaService.assertQaAutomationEnabled).
  if (!currentUser?.qaAutomationEnabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted">Esta función no está disponible en tu cuenta.</p>
      </div>
    );
  }

  const res = await apiFetch("/qa/modules");
  const modules: QaTestModuleSummaryDto[] = res.ok ? await res.json() : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold">QA-AI — Automatización de pruebas</h1>
        <p className="text-sm text-muted">
          Define un módulo puntual de tu aplicación (con su ruta de acceso, si hace falta iniciar sesión y navegar
          antes de llegar a él), genera casos de prueba con IA, y ejecútalos con evidencia real cada vez que quieras
          — sin volver a explorar ni a probar nada fuera de ese alcance.
        </p>
      </div>
      <QaModulesManager initialModules={modules} />
    </div>
  );
}
