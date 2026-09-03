import { redirect } from "next/navigation";
import type { AdminOrganizationDto } from "@devai-factory/shared-types";
import { adminApiFetch } from "@/lib/admin-api";
import {
  PlanSelect,
  SuspendedToggle,
  SubscriptionActiveToggle,
  SingleStoryEnabledToggle,
  IntegrationsEnabledToggle,
  QaAutomationEnabledToggle,
} from "../org-row-controls";

const ROLE_LABEL_ES: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
};

export default async function AdminPage() {
  const res = await adminApiFetch("/admin/organizations");
  if (res.status === 401) {
    redirect("/admin/login");
  }
  const orgs: AdminOrganizationDto[] = res.ok ? await res.json() : [];
  const allUsers = orgs.flatMap((org) => org.users.map((u) => ({ ...u, orgName: org.name })));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div>
        <div>
          <h1 className="font-heading text-xl font-bold">Organizaciones ({orgs.length})</h1>
          <p className="text-sm text-muted">
            Toda organización nueva se registra sin suscripción y queda confinada a Facturación hasta que la
            actives aquí (o pague por Stripe). También cambias el plan manualmente y suspendes por completo el
            acceso de una organización. El módulo &quot;Análisis completo&quot; está incluido automáticamente en
            los planes Team y Empresa — no requiere activación manual.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-medium">Organización</th>
                <th className="px-4 py-3 font-medium">Propietario</th>
                <th className="px-4 py-3 font-medium">Usuarios</th>
                <th className="px-4 py-3 font-medium">Proyectos</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Suscripción</th>
                <th className="px-4 py-3 font-medium">Suspender</th>
                <th className="px-4 py-3 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {org.ownerName ? `${org.ownerName} · ${org.ownerEmail}` : "—"}
                  </td>
                  <td className="px-4 py-3">{org.userCount}</td>
                  <td className="px-4 py-3">{org.projectCount}</td>
                  <td className="px-4 py-3">
                    <PlanSelect orgId={org.id} plan={org.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <SubscriptionActiveToggle orgId={org.id} active={org.subscriptionActive} />
                  </td>
                  <td className="px-4 py-3">
                    <SuspendedToggle orgId={org.id} suspended={org.suspended} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(org.createdAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Todavía no hay organizaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div>
          <h2 className="font-heading text-xl font-bold">Usuarios — módulos por persona</h2>
          <p className="text-sm text-muted">
            &quot;Historia de usuario&quot; está habilitado por defecto para cualquier persona, en cualquier plan
            — desactívalo aquí si necesitas restringir a alguien puntualmente. &quot;Integraciones (Jira/ClickUp)&quot;
            y &quot;QA-AI (pruebas automatizadas)&quot; son al revés: son add-ons que arrancan desactivados para
            todo el mundo, y solo tú los enciendes, persona por persona (piloto, upventa manual, revocar por
            impago).
          </p>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Organización</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Historia de usuario</th>
                <th className="px-4 py-3 font-medium">Integraciones (Jira/ClickUp)</th>
                <th className="px-4 py-3 font-medium">QA-AI (pruebas automatizadas)</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {u.name} <span className="font-normal text-muted">· {u.email}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{u.orgName}</td>
                  <td className="px-4 py-3 text-muted">{ROLE_LABEL_ES[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <SingleStoryEnabledToggle userId={u.id} enabled={u.singleStoryEnabled} />
                  </td>
                  <td className="px-4 py-3">
                    <IntegrationsEnabledToggle userId={u.id} enabled={u.integrationsEnabled} />
                  </td>
                  <td className="px-4 py-3">
                    <QaAutomationEnabledToggle userId={u.id} enabled={u.qaAutomationEnabled} />
                  </td>
                </tr>
              ))}
              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Todavía no hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
