"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IntegrationConnectionDto, SyncRunDto } from "@devai-factory/shared-types";
import { INTEGRATION_PROVIDER_LABEL_ES } from "@devai-factory/shared-types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

const ITEM_TYPE_LABEL_ES: Record<string, string> = {
  epic: "Épica",
  user_story: "Historia",
  test_case: "Caso de prueba",
};

function SyncRunResult({ run }: { run: SyncRunDto }) {
  const created = run.items.filter((i) => i.status === "created");
  const failed = run.items.filter((i) => i.status === "failed");
  const inProgress = run.status === "in_progress";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-accent font-semibold">
          {inProgress
            ? "Enviando..."
            : `${created.length} de ${run.items.length} elementos creados en ${INTEGRATION_PROVIDER_LABEL_ES[run.connection.provider]}`}
        </p>
        {run.status === "completed" && <span className="text-xs text-qubit-green">Completado</span>}
        {run.status === "completed_with_errors" && <span className="text-xs text-amber-600">Con errores</span>}
        {run.status === "failed" && <span className="text-xs text-red-600">Falló</span>}
      </div>
      {run.errorMessage && <p className="text-xs text-red-600">{run.errorMessage}</p>}
      {!inProgress && run.items.length > 0 && (
        <ul className="space-y-1">
          {run.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">
                {ITEM_TYPE_LABEL_ES[item.itemType] ?? item.itemType} {item.internalCode} — {item.internalTitle}
              </span>
              {item.status === "created" && item.externalUrl ? (
                <a href={item.externalUrl} target="_blank" rel="noreferrer" className="shrink-0 text-qubit-blue-600 underline dark:text-qubit-blue-400">
                  Ver
                </a>
              ) : (
                <span className="shrink-0 text-red-600" title={item.errorMessage ?? undefined}>
                  Falló
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SendToIntegrationPanel({ projectId, connections }: { projectId: string; connections: IntegrationConnectionDto[] }) {
  const usable = connections.filter((c) => c.status === "active" && c.mappingConfirmed && c.targetId);
  const [connectionId, setConnectionId] = useState(usable[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SyncRunDto | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!run || run.status !== "in_progress") return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/sync-runs/${run.id}`);
      if (!res.ok) return;
      const data: SyncRunDto = await res.json();
      setRun(data);
      if (data.status !== "in_progress" && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run]);

  async function onSend() {
    if (!connectionId) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo iniciar el envío"));
      }
      const detailRes = await fetch(`/api/sync-runs/${data.id}`);
      setRun(detailRes.ok ? await detailRes.json() : { ...data, items: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  if (usable.length === 0) {
    return (
      <p className="text-sm text-muted">
        {connections.length === 0 ? (
          <>
            Conecta tu Jira o ClickUp en{" "}
            <Link href="/dashboard/integrations" className="underline">
              Integraciones
            </Link>{" "}
            para enviar este contenido automáticamente.
          </>
        ) : (
          <>
            Tus conexiones todavía no están listas para usar (falta elegir destino, confirmar el mapeo, o
            reconectar una expirada) — revísalas en{" "}
            <Link href="/dashboard/integrations" className="underline">
              Integraciones
            </Link>
            .
          </>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
          {usable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({INTEGRATION_PROVIDER_LABEL_ES[c.provider]} — {c.targetLabel})
            </option>
          ))}
        </Select>
        <Button onClick={onSend} loading={sending} disabled={sending || run?.status === "in_progress"}>
          {sending ? "Enviando..." : "Enviar a " + INTEGRATION_PROVIDER_LABEL_ES[usable.find((c) => c.id === connectionId)?.provider ?? "jira"]}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {run && <SyncRunResult run={run} />}
    </div>
  );
}
