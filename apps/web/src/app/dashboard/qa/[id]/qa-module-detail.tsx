"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QaModuleDetailDto, QaMissingDataRequestDto, QaTestCaseDto, QaTestRunDto } from "@devai-factory/shared-types";
import { TEST_CASE_SEVERITY_LABEL_ES } from "@devai-factory/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBadge } from "@/components/ui/card";
import { Spinner } from "@/components/spinner";
import { extractErrorMessage } from "@/lib/error-message";
import { StepsEditor } from "../step-editor";

const CASE_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador — pendiente de aprobar",
  blocked_missing_data: "Bloqueado — faltan datos",
  ready: "Listo para ejecutar",
  archived: "Archivado",
};
const CASE_STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "amber"> = {
  draft: "blue",
  blocked_missing_data: "amber",
  ready: "green",
  archived: "neutral",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  in_progress: "En curso",
  passed: "Pasó",
  failed: "Falló",
  error: "Error",
};
const RUN_STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "amber" | "red"> = {
  in_progress: "blue",
  passed: "green",
  failed: "red",
  error: "amber",
};

/**
 * Un dato faltante siempre se ve y se puede copiar/pegar/editar — es la
 * propia cuenta de prueba del cliente para su módulo, no un secreto de un
 * tercero, así que ocultarlo con puntos solo estorba para verificar que se
 * escribió bien. Se guarda cifrado igual, eso no cambia — solo no se
 * esconde de quien ya tiene permiso de ver este módulo.
 */
function MissingDataItem({ request, onResolved }: { request: QaMissingDataRequestDto; onResolved: () => void }) {
  const isResolved = request.status === "resolved";
  const [editing, setEditing] = useState(!isResolved);
  const [value, setValue] = useState(request.value ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/qa/missing-data/${request.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo guardar el dato"));
      setEditing(false);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (isResolved && !editing) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm">
        <div>
          <p className="text-muted">{request.question}</p>
          <p className="font-accent mt-0.5">{request.value}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setValue(request.value ?? "");
            setEditing(true);
          }}
          className="shrink-0 text-xs text-qubit-blue-600 underline dark:text-qubit-blue-400"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
      <p className="text-amber-800 dark:text-amber-200">
        <strong>Dato requerido:</strong> {request.question}
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300">Formato: {request.format}</p>
      <div className="flex items-center gap-2">
        <Input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Respuesta" required />
        <Button type="submit" loading={loading} disabled={loading}>
          Guardar
        </Button>
        {isResolved && (
          <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function TestCaseRow({ testCase, onChanged }: { testCase: QaTestCaseDto; onChanged: () => void }) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setError(null);
    setApproving(true);
    try {
      const res = await fetch(`/api/qa/test-cases/${testCase.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo aprobar el caso"));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setApproving(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-accent text-xs font-semibold text-muted">{testCase.code}</span>
            <p className="font-accent text-sm font-semibold">{testCase.title}</p>
            <CardBadge tone="neutral">{TEST_CASE_SEVERITY_LABEL_ES[testCase.severity]}</CardBadge>
          </div>
          <p className="mt-0.5 text-xs text-muted">{testCase.expectedResult}</p>
        </div>
        <div className="flex items-center gap-2">
          <CardBadge tone={CASE_STATUS_TONE[testCase.status]}>{CASE_STATUS_LABEL[testCase.status]}</CardBadge>
          {testCase.status === "draft" && (
            <Button variant="secondary" onClick={onApprove} loading={approving} disabled={approving}>
              Aprobar
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {testCase.missingDataRequests.map((req) => (
        <MissingDataItem key={req.id} request={req} onResolved={onChanged} />
      ))}
    </Card>
  );
}

function RunRow({ run }: { run: QaTestRunDto }) {
  const passed = run.items.filter((i) => i.status === "passed").length;
  return (
    <Card className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{new Date(run.startedAt).toLocaleString("es-CO")}</p>
          {run.items.length > 0 && (
            <p className="text-sm">
              {passed} de {run.items.length} casos pasaron
            </p>
          )}
          {run.errorMessage && <p className="text-xs text-red-600">{run.errorMessage}</p>}
        </div>
        <div className="flex items-center gap-2">
          <CardBadge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status]}</CardBadge>
          {run.reportFile && (
            <a href={`/api/qa/runs/${run.id}/report`} className="text-xs text-qubit-blue-600 underline dark:text-qubit-blue-400">
              Descargar reporte
            </a>
          )}
        </div>
      </div>
      {run.items.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {run.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span className="text-muted">
                {item.testCase.code} — {item.testCase.title}
              </span>
              <span className={item.status === "passed" ? "text-qubit-green" : "text-red-600"}>{RUN_STATUS_LABEL[item.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function QaModuleDetail({ initialDetail }: { initialDetail: QaModuleDetailDto }) {
  const router = useRouter();
  const { module, testCases, testRuns } = initialDetail;
  const [generating, setGenerating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState(module.setupSteps);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const readyCount = testCases.filter((c) => c.status === "ready").length;
  const hasInProgressRun = testRuns.some((r) => r.status === "in_progress");

  useEffect(() => {
    if (!hasInProgressRun) return;
    pollRef.current = setInterval(() => router.refresh(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasInProgressRun, router]);

  async function onGenerateCases() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/qa/modules/${module.id}/generate-cases`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo generar los casos de prueba"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGenerating(false);
    }
  }

  async function onDiscover() {
    setError(null);
    setDiscovering(true);
    try {
      const res = await fetch(`/api/qa/modules/${module.id}/discover`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo detectar la estructura"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDiscovering(false);
    }
  }

  async function onSaveSetupSteps() {
    setError(null);
    try {
      const res = await fetch(`/api/qa/modules/${module.id}/setup-steps`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupSteps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo guardar la ruta de acceso"));
      setEditingSetup(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function onTriggerRun() {
    setError(null);
    setTriggering(true);
    try {
      const res = await fetch(`/api/qa/modules/${module.id}/runs`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data, "No se pudo iniciar la ejecución"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-xl font-bold">{module.name}</h1>
        <p className="text-sm text-muted">{module.targetUrl}</p>
        <p className="mt-2 text-sm">{module.description}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-accent text-sm font-semibold">Ruta de acceso al módulo (precondición)</h2>
          {!editingSetup && (
            <Button variant="secondary" onClick={() => setEditingSetup(true)}>
              {module.setupSteps.length > 0 ? "Editar" : "Definir ruta de acceso"}
            </Button>
          )}
        </div>
        {editingSetup ? (
          <div className="space-y-2">
            <StepsEditor steps={setupSteps} onChange={setSetupSteps} />
            <div className="flex gap-2">
              <Button onClick={onSaveSetupSteps}>Guardar</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSetupSteps(module.setupSteps);
                  setEditingSetup(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : module.setupSteps.length === 0 ? (
          <p className="text-sm text-muted">Este módulo no tiene pasos de acceso — se prueba directamente desde la URL.</p>
        ) : (
          <ol className="space-y-1 text-sm text-muted">
            {module.setupSteps.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.description}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-accent text-sm font-semibold">Estructura detectada</h2>
          <Button variant="secondary" onClick={onDiscover} loading={discovering} disabled={discovering}>
            {discovering ? "Detectando..." : module.discoveredStructure ? "Detectar de nuevo" : "Detectar estructura"}
          </Button>
        </div>
        {!module.discoveredStructure ? (
          <p className="text-sm text-muted">
            Todavía no se ha detectado la estructura real de la página — detectarla ayuda a que la IA proponga
            selectores exactos (botones, campos, links) en vez de adivinarlos.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-muted">
            {module.discoveredStructure.pages.map((p, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{p.title || p.url}</span> — {p.buttons.length} botones,{" "}
                {p.inputs.length} campos, {p.links.length} links
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-accent text-sm font-semibold">Casos de prueba ({testCases.length})</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onGenerateCases} loading={generating} disabled={generating}>
              {generating ? "Generando con IA..." : "Generar casos con IA"}
            </Button>
            <Button onClick={onTriggerRun} loading={triggering} disabled={triggering || readyCount === 0 || hasInProgressRun}>
              {hasInProgressRun ? "Ejecutando..." : `Ejecutar pruebas (${readyCount} listos)`}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {testCases.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay casos de prueba — genera algunos con IA.</p>
        ) : (
          <div className="space-y-2">
            {testCases.map((tc) => (
              <TestCaseRow key={tc.id} testCase={tc} onChanged={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-accent text-sm font-semibold">Corridas</h2>
        {testRuns.length === 0 ? (
          <p className="text-sm text-muted">Todavía no se ha ejecutado ninguna corrida.</p>
        ) : (
          <div className="space-y-2">
            {testRuns.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
        {hasInProgressRun && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3 w-3" /> Ejecutando pruebas reales con Playwright — esto puede tardar según el número de casos.
          </p>
        )}
      </section>
    </div>
  );
}
