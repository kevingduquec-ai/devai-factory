"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ConnectIntegrationResultDto,
  IntegrationConnectionDto,
  IntegrationTargetOption,
  SelectTargetResultDto,
  IntegrationProvider,
} from "@devai-factory/shared-types";
import { INTEGRATION_PROVIDER_LABEL_ES } from "@devai-factory/shared-types";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

const STATUS_LABEL_ES: Record<string, string> = {
  active: "Activa",
  expired: "Expirada — reconecta",
  revoked: "Revocada",
};

function StatusBadge({ status }: { status: string }) {
  const good = status === "active";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        good ? "bg-qubit-green/15 text-green-700 dark:text-qubit-green" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      }`}
    >
      {STATUS_LABEL_ES[status] ?? status}
    </span>
  );
}

/** Formulario de conexión: ClickUp solo pide el token; Jira además pide la URL del sitio y el correo (Basic Auth). */
function ConnectForm({ provider, onConnected, onCancel }: { provider: IntegrationProvider; onConnected: (result: ConnectIntegrationResultDto) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          label,
          ...(provider === "jira" ? { siteUrl, authEmail } : {}),
          apiToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo conectar"));
      }
      onConnected(data as ConnectIntegrationResultDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="font-accent text-sm font-semibold">Conectar {INTEGRATION_PROVIDER_LABEL_ES[provider]}</p>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Nombre para identificar esta conexión</label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Mi ${INTEGRATION_PROVIDER_LABEL_ES[provider]}`} required />
      </div>
      {provider === "jira" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">URL de tu sitio de Jira</label>
            <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://tuempresa.atlassian.net" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Correo asociado al API token</label>
            <Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="tucorreo@empresa.com" required />
          </div>
        </>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          {provider === "jira" ? "API token" : "Token personal de la API"}
        </label>
        <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="••••••••••••" required />
        <p className="mt-1 text-xs text-muted">
          {provider === "jira"
            ? "Créalo en id.atlassian.com → Configuración de la cuenta → Seguridad → API tokens."
            : "Créalo en ClickUp → Configuración → Apps → API Token."}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={loading} disabled={loading}>
          {loading ? "Conectando..." : "Conectar"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Paso 2: elegir el destino concreto (proyecto de Jira / lista de ClickUp) entre los detectados. */
function TargetPicker({
  connection,
  targets,
  onSelected,
}: {
  connection: IntegrationConnectionDto;
  targets: IntegrationTargetOption[];
  onSelected: (result: SelectTargetResultDto) => void;
}) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = targets.find((t) => t.id === targetId);
    if (!chosen) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}/target`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: chosen.id, targetLabel: chosen.label }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo detectar la estructura de ese destino"));
      }
      onSelected(data as SelectTargetResultDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (targets.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        No se encontró ningún {connection.provider === "jira" ? "proyecto" : "lista"} disponible con esas
        credenciales. Crea uno en {INTEGRATION_PROVIDER_LABEL_ES[connection.provider]} y vuelve a intentar.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="font-accent text-sm font-semibold">Elige el destino en {connection.label}</p>
      <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </Select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading} disabled={loading}>
        {loading ? "Detectando estructura..." : "Continuar"}
      </Button>
    </form>
  );
}

/** Paso 3: revisar y confirmar el mapeo heurístico sugerido — solo se pregunta una vez. */
function MappingReview({
  connection,
  onConfirmed,
}: {
  connection: IntegrationConnectionDto;
  onConfirmed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapping = connection.mapping;

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo confirmar el mapeo"));
      }
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="font-accent text-sm font-semibold">Confirma el mapeo detectado en {connection.targetLabel}</p>
      <ul className="space-y-1 text-sm">
        {connection.provider === "jira" && (
          <>
            <li>
              Épica (requerimiento) → tipo de issue <strong>{mapping?.epicIssueTypeName ?? "no detectado"}</strong>
            </li>
            <li>
              Historia de usuario → tipo de issue <strong>{mapping?.storyIssueTypeName ?? "no detectado"}</strong>
            </li>
            <li>
              Caso de prueba → subtarea <strong>{mapping?.testCaseIssueTypeName ?? "no disponible en este proyecto"}</strong>
            </li>
          </>
        )}
        <li>
          Story points → campo <strong>{mapping?.storyPointsFieldName ?? "no detectado, se omitirán"}</strong>
        </li>
      </ul>
      {mapping?.notes && mapping.notes.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {mapping.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={onConfirm} loading={loading} disabled={loading}>
        {loading ? "Confirmando..." : "Confirmar y activar conexión"}
      </Button>
    </div>
  );
}

function ConnectionRow({ connection, onChanged }: { connection: IntegrationConnectionDto; onChanged: () => void }) {
  const [busy, setBusy] = useState<"rediscover" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTargets, setPendingTargets] = useState<IntegrationTargetOption[] | null>(null);
  const [pendingConnection, setPendingConnection] = useState<IntegrationConnectionDto | null>(null);

  async function onRediscover() {
    setError(null);
    setBusy("rediscover");
    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}/rediscover`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo detectar de nuevo"));
      }
      const result = data as ConnectIntegrationResultDto;
      setPendingConnection(result.connection);
      setPendingTargets(result.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect() {
    setError(null);
    setBusy("disconnect");
    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(extractErrorMessage(data, "No se pudo desconectar"));
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  if (pendingConnection && pendingTargets) {
    return (
      <TargetPicker
        connection={pendingConnection}
        targets={pendingTargets}
        onSelected={(result) => {
          setPendingConnection(result.connection);
          setPendingTargets(null);
        }}
      />
    );
  }
  if (pendingConnection && !pendingConnection.mappingConfirmed) {
    return (
      <MappingReview
        connection={pendingConnection}
        onConfirmed={() => {
          setPendingConnection(null);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-accent text-sm font-semibold">{connection.label}</p>
          <StatusBadge status={connection.status} />
          {connection.mappingConfirmed && (
            <span className="rounded-full bg-qubit-blue-400/15 px-2.5 py-1 text-xs font-medium text-qubit-blue-600 dark:text-qubit-blue-400">
              Lista para usar
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {INTEGRATION_PROVIDER_LABEL_ES[connection.provider]} · {connection.targetLabel ?? "sin destino elegido"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onRediscover} loading={busy === "rediscover"} disabled={busy !== null}>
          Detectar de nuevo
        </Button>
        <Button variant="secondary" onClick={onDisconnect} loading={busy === "disconnect"} disabled={busy !== null}>
          Desconectar
        </Button>
      </div>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ConnectionsManager({ initialConnections }: { initialConnections: IntegrationConnectionDto[] }) {
  const router = useRouter();
  // Sin estado propio para la lista: cada mutación (desconectar, detectar de
  // nuevo, confirmar mapeo) llama a refresh(), que re-ejecuta el Server
  // Component padre y vuelve a pasar `initialConnections` — más simple y sin
  // riesgo de quedar desincronizado, ya que useState no se resincroniza solo
  // con props nuevas tras el primer render.
  const connections = initialConnections;
  const [addingProvider, setAddingProvider] = useState<IntegrationProvider | null>(null);
  const [onboarding, setOnboarding] = useState<{ connection: IntegrationConnectionDto; targets: IntegrationTargetOption[] } | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {connections.length === 0 && !onboarding && (
          <p className="text-sm text-muted">Todavía no has conectado ningún Jira o ClickUp.</p>
        )}
        {connections.map((c) => (
          <ConnectionRow key={c.id} connection={c} onChanged={refresh} />
        ))}
      </section>

      {onboarding ? (
        onboarding.connection.mappingConfirmed ? null : onboarding.targets.length > 0 && !onboarding.connection.targetId ? (
          <TargetPicker
            connection={onboarding.connection}
            targets={onboarding.targets}
            onSelected={(result) => setOnboarding({ connection: result.connection, targets: [] })}
          />
        ) : (
          <MappingReview
            connection={onboarding.connection}
            onConfirmed={() => {
              setOnboarding(null);
              refresh();
            }}
          />
        )
      ) : addingProvider ? (
        <ConnectForm
          provider={addingProvider}
          onCancel={() => setAddingProvider(null)}
          onConnected={(result) => {
            setAddingProvider(null);
            setOnboarding(result);
          }}
        />
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAddingProvider("jira")}>
            + Conectar Jira
          </Button>
          <Button variant="secondary" onClick={() => setAddingProvider("clickup")}>
            + Conectar ClickUp
          </Button>
        </div>
      )}
    </div>
  );
}
