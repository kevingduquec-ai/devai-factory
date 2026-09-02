"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@devai-factory/shared-types";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/lib/error-message";

const STAGE_LABELS: [number, string][] = [
  [0, "Iniciando..."],
  [5, "Analizando el intake..."],
  [25, "Extrayendo requerimientos..."],
  [45, "Escribiendo historias de usuario y criterios de aceptación..."],
  [55, "Diseñando el modelo de datos y generando casos de prueba en paralelo..."],
  [80, "Guardando el paquete completo..."],
  [100, "Completado"],
];

const STORIES_ONLY_STAGE_LABELS: [number, string][] = [
  [0, "Iniciando..."],
  [5, "Analizando la descripción..."],
  [60, "Escribiendo la historia de usuario y sus criterios de aceptación..."],
  [100, "Completado"],
];

function stageLabel(progress: number, storiesOnly: boolean): string {
  const labels = storiesOnly ? STORIES_ONLY_STAGE_LABELS : STAGE_LABELS;
  let label = labels[0][1];
  for (const [threshold, text] of labels) {
    if (progress >= threshold) label = text;
  }
  return label;
}

export function GeneratePanel({
  projectId,
  status,
  storiesOnly = false,
}: {
  projectId: string;
  status: ProjectStatus;
  storiesOnly?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== "generating") return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/projects/${projectId}/generate/status`);
      if (!res.ok) return;
      const data = await res.json();
      setProgress(typeof data.progress === "number" ? data.progress : 0);
      if (data.projectStatus !== "generating") {
        if (pollRef.current) clearInterval(pollRef.current);
        router.refresh();
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, projectId, router]);

  async function onGenerate() {
    setError(null);
    setTriggering(true);
    setProgress(0);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo iniciar la generación"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTriggering(false);
    }
  }

  if (status === "generating") {
    return (
      <div className="space-y-2 rounded-lg border border-qubit-blue-400/30 bg-qubit-blue-400/10 px-4 py-3 text-sm text-qubit-blue-600 dark:text-qubit-blue-400">
        <div className="flex items-center justify-between">
          <span className="font-accent">{stageLabel(progress, storiesOnly)}</span>
          <span className="font-mono text-xs">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-qubit-blue-400/20">
          <div
            className="h-full rounded-full bg-qubit-blue-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {status === "failed" && (
        <p className="text-sm text-red-600">
          La generación falló. Puedes intentarlo de nuevo.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={onGenerate} loading={triggering}>
        {triggering
          ? "Iniciando..."
          : status === "generated"
            ? storiesOnly
              ? "Regenerar historia de usuario"
              : "Regenerar paquete completo"
            : storiesOnly
              ? "Generar historia de usuario"
              : "Generar paquete completo"}
      </Button>
    </div>
  );
}
