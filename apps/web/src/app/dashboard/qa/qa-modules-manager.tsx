"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QaStepDto, QaTestModuleSummaryDto } from "@devai-factory/shared-types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBadge } from "@/components/ui/card";
import { extractErrorMessage } from "@/lib/error-message";
import { StepsEditor } from "./step-editor";

function CreateModuleForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [description, setDescription] = useState("");
  const [setupSteps, setSetupSteps] = useState<QaStepDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/qa/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, targetUrl, description, scopeMode: "scoped", setupSteps }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo crear el módulo"));
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <p className="font-accent text-sm font-semibold">Nuevo módulo a probar (Modo B — alcance puntual)</p>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Nombre del módulo</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Creación de producto" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">URL base de la aplicación</label>
        <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://tuapp.com" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Qué hay que probar (para que la IA proponga los casos)</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Ej: el formulario de creación de producto — nombre, precio, categoría y stock inicial. Debe validar precio negativo y nombre vacío."
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Ruta de acceso al módulo (precondición reutilizable) — deja vacío si el módulo es la primera pantalla
        </label>
        <p className="mb-2 text-xs text-muted">
          Ej: ir a /login, escribir el correo, escribir la contraseña, hacer clic en &quot;Entrar&quot;, hacer clic
          en &quot;Inventario&quot;, hacer clic en &quot;Crear producto&quot;. Estos pasos se ejecutan antes de cada
          caso de prueba de este módulo — nunca se vuelven a pedir.
        </p>
        <StepsEditor steps={setupSteps} onChange={setSetupSteps} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={loading} disabled={loading}>
          {loading ? "Creando..." : "Crear módulo"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

const STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "amber"> = {
  scoped: "blue",
  full: "neutral",
};

export function QaModulesManager({ initialModules }: { initialModules: QaTestModuleSummaryDto[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      {initialModules.length === 0 && !creating && <p className="text-sm text-muted">Todavía no has definido ningún módulo a probar.</p>}

      <div className="space-y-2">
        {initialModules.map((m) => (
          <Link key={m.id} href={`/dashboard/qa/${m.id}`}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-accent text-sm font-semibold">{m.name}</p>
                  <CardBadge tone={STATUS_TONE[m.scopeMode] ?? "neutral"}>{m.scopeMode === "scoped" ? "Alcance puntual" : "Exploración completa"}</CardBadge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{m.targetUrl}</p>
              </div>
              <p className="text-xs text-muted">
                {m._count.testCases} caso{m._count.testCases === 1 ? "" : "s"} · {m._count.testRuns} corrida{m._count.testRuns === 1 ? "" : "s"}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {creating ? (
        <CreateModuleForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          + Nuevo módulo
        </Button>
      )}
    </div>
  );
}
