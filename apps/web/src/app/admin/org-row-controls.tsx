"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionPlan } from "@devai-factory/shared-types";
import { PLAN_LABEL_ES } from "@devai-factory/shared-types";
import { Select } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

const PLAN_ORDER: SubscriptionPlan[] = ["starter", "team", "empresa"];

export function PlanSelect({ orgId, plan, disabled }: { orgId: string; plan: SubscriptionPlan; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(extractErrorMessage(data, "No se pudo cambiar el plan"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Select value={plan} disabled={loading || disabled} onChange={(e) => onChange(e.target.value)}>
        {PLAN_ORDER.map((p) => (
          <option key={p} value={p}>
            {PLAN_LABEL_ES[p]}
          </option>
        ))}
      </Select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Interruptor genérico para un flag booleano de organización. `activeIsGood`
 * decide la paleta: para "suscripción" true = bueno (verde); para
 * "suspendida" true = malo (rojo) — se pasa false en ese caso.
 */
function ToggleButton({
  endpoint,
  field,
  value,
  labelOn,
  labelOff,
  activeIsGood,
}: {
  endpoint: string;
  field: string;
  value: boolean;
  labelOn: string;
  labelOff: string;
  activeIsGood: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !value }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(extractErrorMessage(data, "No se pudo cambiar la configuración"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  const goodState = activeIsGood ? value : !value;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className={`font-accent inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition ${
          goodState
            ? "bg-qubit-green/15 text-green-700 dark:text-qubit-green"
            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
        }`}
      >
        {value ? labelOn : labelOff}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** "Suspendida" bloquea el acceso de todos los usuarios de la organización, sin importar el plan. */
export function SuspendedToggle({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  return (
    <ToggleButton
      endpoint={`/api/admin/organizations/${orgId}`}
      field="suspended"
      value={suspended}
      labelOn="Suspendida"
      labelOff="Activa"
      activeIsGood={false}
    />
  );
}

/**
 * Toda organización nueva arranca sin suscripción — confinada a Facturación
 * y sin poder crear ni generar proyectos — hasta que Stripe confirme un
 * pago o el super-admin la active aquí manualmente.
 */
export function SubscriptionActiveToggle({ orgId, active }: { orgId: string; active: boolean }) {
  return (
    <ToggleButton
      endpoint={`/api/admin/organizations/${orgId}`}
      field="subscriptionActive"
      value={active}
      labelOn="Activa"
      labelOff="Sin suscripción"
      activeIsGood={true}
    />
  );
}

/**
 * El módulo "Historia de usuario" está habilitado por defecto para toda
 * persona en cualquier plan — este toggle es la única forma de restringir
 * el acceso, y es siempre por persona, nunca por organización completa.
 */
export function SingleStoryEnabledToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  return (
    <ToggleButton
      endpoint={`/api/admin/users/${userId}`}
      field="singleStoryEnabled"
      value={enabled}
      labelOn="Disponible"
      labelOff="Desactivado"
      activeIsGood={true}
    />
  );
}

/**
 * Add-on "Creación automática en Jira/ClickUp" — al revés del anterior,
 * arranca desactivado para todo el mundo. El super-admin lo enciende
 * persona por persona (piloto, upventa manual, revocar por impago), nunca
 * un beneficio automático de ningún plan.
 */
export function IntegrationsEnabledToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  return (
    <ToggleButton
      endpoint={`/api/admin/users/${userId}`}
      field="integrationsEnabled"
      value={enabled}
      labelOn="Activo"
      labelOff="Inactivo"
      activeIsGood={true}
    />
  );
}
