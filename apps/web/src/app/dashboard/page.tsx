import Link from "next/link";
import type { OrgUserDto, ProjectDto, UsageStatusDto } from "@devai-factory/shared-types";
import { PLAN_LABEL_ES, planIncludesFullAnalysis } from "@devai-factory/shared-types";
import { requireActiveSubscription } from "@/lib/session";
import { apiFetch, safeJson } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InviteUserForm } from "./invite-user-form";

const ROLE_LABEL_ES: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
};

export default async function DashboardPage() {
  const session = await requireActiveSubscription();
  const canUseFullAnalysis = planIncludesFullAnalysis(session.organization.plan);

  const [projectsRes, usageRes] = await Promise.all([
    apiFetch("/projects?storiesOnly=false"),
    apiFetch("/orgs/usage"),
  ]);
  const projects: ProjectDto[] = projectsRes.ok ? await projectsRes.json() : [];
  const usage = usageRes.ok ? await safeJson<UsageStatusDto>(usageRes) : null;
  const isOwner = session.currentUserRole === "owner";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold">Análisis completo</h1>
          <p className="text-sm text-muted">Requerimientos, historias, modelo de datos, API y casos de prueba</p>
        </div>
        {canUseFullAnalysis ? (
          <Link href="/dashboard/projects/new">
            <Button>Nuevo análisis completo</Button>
          </Link>
        ) : (
          <Link href="/dashboard/billing">
            <Button variant="secondary">Mejora tu plan para desbloquearlo</Button>
          </Link>
        )}
      </div>

      {!canUseFullAnalysis && (
        <p className="rounded-lg border border-qubit-blue-400/30 bg-qubit-blue-400/5 px-4 py-2.5 text-xs text-qubit-blue-600 dark:text-qubit-blue-400">
          El análisis completo no está incluido en tu plan {PLAN_LABEL_ES[session.organization.plan]}. Mientras
          tanto, puedes usar el módulo de{" "}
          <Link href="/dashboard/quick-stories" className="underline">
            historia de usuario
          </Link>{" "}
          individual, disponible en todos los planes.
        </p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            Todavía no tienes proyectos de análisis completo. Crea uno describiendo la necesidad de software en
            lenguaje natural.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
              <Card className="h-full cursor-pointer hover:border-qubit-blue-400/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-accent font-medium">{p.name}</p>
                    {p.domain && <p className="mt-0.5 text-xs capitalize text-muted">{p.domain}</p>}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {usage && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-accent text-sm font-semibold text-muted">Uso de tu plan</h2>
              <p className="mt-1 text-sm">
                Plan <span className="font-medium">{PLAN_LABEL_ES[usage.plan]}</span> ·{" "}
                {usage.projectsThisMonth} de {usage.maxProjectsPerMonth ?? "∞"} análisis nuevos usados este mes
              </p>
              {usage.maxGenerationsPerMonth != null && (
                <p className="mt-0.5 text-xs text-muted">
                  {usage.generationsThisMonth} de {usage.maxGenerationsPerMonth} generaciones usadas (incluye
                  regenerar un paquete existente)
                </p>
              )}
            </div>
            <Link href="/dashboard/billing">
              <Button variant="secondary">Gestionar plan</Button>
            </Link>
          </div>
          {usage.maxProjectsPerMonth != null && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-qubit-blue-400"
                style={{
                  width: `${Math.min(100, (usage.projectsThisMonth / usage.maxProjectsPerMonth) * 100)}%`,
                }}
              />
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-accent text-sm font-semibold text-muted">Equipo</h2>
          {isOwner && <InviteUserForm />}
        </div>
        <ul className="divide-y divide-border">
          {session.users.map((u: OrgUserDto) => (
            <li key={u.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>
                {u.name} <span className="text-muted">· {u.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <CardBadge tone="blue">{ROLE_LABEL_ES[u.role] ?? u.role}</CardBadge>
                {u.status === "invited" && <CardBadge tone="amber">invitado</CardBadge>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
