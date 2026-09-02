import type { IntegrationConnectionDto } from "@devai-factory/shared-types";
import { apiFetch } from "@/lib/api";
import { requireActiveSubscription } from "@/lib/session";
import { ConnectionsManager } from "./connections-manager";

export default async function IntegrationsPage() {
  const session = await requireActiveSubscription();
  const currentUser = session.users.find((u) => u.id === session.currentUserId);

  // Nunca se muestra ningún botón ni mención de Jira/ClickUp si el
  // super-admin no activó el add-on para esta persona — ni siquiera
  // entrando por URL directa (el backend también bloquea cada acción, ver
  // IntegrationsService.assertIntegrationsEnabled).
  if (!currentUser?.integrationsEnabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted">Esta función no está disponible en tu cuenta.</p>
      </div>
    );
  }

  const res = await apiFetch("/integrations/connections");
  const connections: IntegrationConnectionDto[] = res.ok ? await res.json() : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold">Integraciones</h1>
        <p className="text-sm text-muted">
          Conecta tu Jira o ClickUp una vez y, desde cualquier proyecto generado, envía tus requerimientos,
          historias de usuario y casos de prueba directamente como issues o tareas — sin copiar y pegar nada.
        </p>
      </div>
      <ConnectionsManager initialConnections={connections} />
    </div>
  );
}
