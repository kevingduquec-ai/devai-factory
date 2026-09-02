import Link from "next/link";
import type { ProjectDto, UsageStatusDto } from "@devai-factory/shared-types";
import { requireActiveSubscription } from "@/lib/session";
import { apiFetch, safeJson } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function QuickStoriesPage() {
  const session = await requireActiveSubscription();
  const currentUser = session.users.find((u) => u.id === session.currentUserId);
  const canUseSingleStory = currentUser?.singleStoryEnabled ?? true;

  const [projectsRes, usageRes] = await Promise.all([
    apiFetch("/projects?storiesOnly=true"),
    apiFetch("/orgs/usage"),
  ]);
  const projects: ProjectDto[] = projectsRes.ok ? await projectsRes.json() : [];
  const usage = usageRes.ok ? await safeJson<UsageStatusDto>(usageRes) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold">Historia de usuario</h1>
          <p className="text-sm text-muted">Describe una necesidad puntual y recibe una sola historia de usuario</p>
        </div>
        {canUseSingleStory ? (
          <Link href="/dashboard/quick-stories/new">
            <Button>Nueva historia</Button>
          </Link>
        ) : (
          <Button disabled>No disponible</Button>
        )}
      </div>

      {usage && (
        <p className="text-xs text-muted">
          {usage.projectsThisMonth} de {usage.maxProjectsPerMonth ?? "∞"} análisis nuevos usados este mes (cupo
          compartido con el análisis completo) ·{" "}
          <Link href="/dashboard/billing" className="underline">
            ver detalle de tu plan
          </Link>
        </p>
      )}

      {!canUseSingleStory && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Un administrador desactivó tu acceso a este módulo. Contacta al equipo de Qubit si crees que es un error.
        </p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            Todavía no tienes historias de usuario. Crea una dando un título y describiendo la necesidad puntual.
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
    </div>
  );
}
