import Link from "next/link";
import { redirect } from "next/navigation";
import type { SubscriptionPlan, UsageStatusDto } from "@devai-factory/shared-types";
import { PLAN_LABEL_ES, PLAN_LIMITS, PLAN_PRICE_COP } from "@devai-factory/shared-types";
import { requireSession } from "@/lib/session";
import { apiFetch, safeJson } from "@/lib/api";
import { Card, CardBadge } from "@/components/ui/card";
import { UpgradeButton, ManageBillingButton } from "./plan-actions";

const PLAN_ORDER: SubscriptionPlan[] = ["starter", "team", "empresa"];

function planFeatures(plan: SubscriptionPlan): string[] {
  const limits = PLAN_LIMITS[plan];
  // El add-on de integración con Jira/ClickUp no está amarrado a ningún
  // plan — se activa por persona desde el panel de super-admin (ver
  // User.integrationsEnabled) — pero sigue siendo un servicio del catálogo
  // que debe verse aquí como cualquier otro, en los tres planes, para que
  // el cliente sepa que existe y pueda pedirlo.
  const integrationsAddOn = "Integración automática con Jira/ClickUp (add-on, actívalo con nuestro equipo)";

  if (plan === "empresa") {
    return [
      "Análisis completo y módulo de historia de usuario, ilimitados",
      "Usuarios ilimitados",
      "Base de conocimiento privada por dominio",
      "Onboarding dedicado y SLA de soporte",
      integrationsAddOn,
      "Venta asistida — contacta a nuestro equipo",
    ];
  }
  if (plan === "starter") {
    return [
      "Módulo de historia de usuario (título + descripción → 1 historia)",
      `Hasta ${limits.maxProjectsPerMonth} historias por mes`,
      `${limits.maxUsers} usuario`,
      "Exportación a PDF y Word",
      "Historial ilimitado",
      integrationsAddOn,
    ];
  }
  return [
    "Incluye el análisis completo (requerimientos, historias, modelo de datos, API y casos de prueba)",
    "Incluye también el módulo de historia de usuario individual",
    `${limits.maxProjectsPerMonth} análisis nuevos por mes`,
    `Hasta ${limits.maxGenerationsPerMonth} generaciones/mes (incluye regenerar un paquete existente)`,
    `${limits.maxUsers} usuarios`,
    "Exportación a PDF y Word",
    "Soporte prioritario",
    integrationsAddOn,
  ];
}

function formatCOP(value: number | null): string {
  if (value == null) return "A medida";
  return `$${value.toLocaleString("es-CO")} COP/mes`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }
  const { checkout } = await searchParams;
  const isOwner = session.currentUserRole === "owner";

  const usageRes = await apiFetch("/orgs/usage");
  const usage = usageRes.ok ? await safeJson<UsageStatusDto>(usageRes) : null;
  const currentPlan = session.organization.plan;
  const subscriptionActive = session.organization.subscriptionActive;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        {subscriptionActive && (
          <Link href="/dashboard" className="text-sm text-muted hover:underline">
            ← Análisis completo
          </Link>
        )}
        <h1 className="font-heading mt-2 text-xl font-bold">Facturación y plan</h1>
        <p className="text-sm text-muted">Administra el plan de tu organización y tu método de pago.</p>
      </div>

      {!subscriptionActive && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tu organización todavía no tiene una suscripción activa — elige un plan abajo para empezar a generar
          proyectos. Si ya hablaste con nuestro equipo, pídeles que la activen desde su panel.
        </p>
      )}

      {checkout === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Pago procesado. Tu plan se actualizará en unos segundos cuando Stripe confirme la suscripción.
        </p>
      )}
      {checkout === "canceled" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          El pago se canceló. Puedes intentarlo de nuevo cuando quieras.
        </p>
      )}

      {usage && subscriptionActive && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Plan actual</p>
              <p className="font-accent text-lg font-semibold">{PLAN_LABEL_ES[currentPlan]}</p>
              <p className="mt-1 text-sm text-muted">
                {usage.projectsThisMonth} de {usage.maxProjectsPerMonth ?? "∞"} análisis nuevos ·{" "}
                {usage.generationsThisMonth} de {usage.maxGenerationsPerMonth ?? "∞"} generaciones ·{" "}
                {usage.users} de {usage.maxUsers ?? "∞"} usuarios
              </p>
            </div>
            {isOwner && session.organization.billingCustomerId && <ManageBillingButton />}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const isCurrent = subscriptionActive && plan === currentPlan;
          const limits = PLAN_LIMITS[plan];
          return (
            <Card key={plan} className={isCurrent ? "border-qubit-blue-400 ring-1 ring-qubit-blue-400/30" : ""}>
              <div className="flex items-center justify-between">
                <p className="font-accent text-base font-semibold">{PLAN_LABEL_ES[plan]}</p>
                {isCurrent && <CardBadge tone="blue">Plan actual</CardBadge>}
              </div>
              <p className="mt-1 text-sm font-medium">{formatCOP(PLAN_PRICE_COP[plan])}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-muted">
                {planFeatures(plan).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? null : limits.selfService ? (
                  isOwner ? (
                    <UpgradeButton plan={plan as "starter" | "team"} />
                  ) : (
                    <p className="text-xs text-muted">Solo el propietario de la organización puede cambiar el plan.</p>
                  )
                ) : (
                  <p className="text-xs text-muted">Plan de venta asistida — escríbenos para contratarlo.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
