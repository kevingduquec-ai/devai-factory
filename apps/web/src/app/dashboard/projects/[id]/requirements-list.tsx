"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequirementDto, RequirementPriority, RequirementStatus } from "@devai-factory/shared-types";
import {
  REQUIREMENT_PRIORITY_LABEL_ES,
  REQUIREMENT_STATUS_LABEL_ES,
  REQUIREMENT_TYPE_LABEL_ES,
} from "@devai-factory/shared-types";
import { Spinner } from "@/components/spinner";
import { Card, CardBadge } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PRIORITIES: RequirementPriority[] = ["must", "should", "could", "wont"];
const STATUSES: RequirementStatus[] = ["draft", "approved", "implemented", "obsolete"];

const PRIORITY_TONE: Record<RequirementPriority, "blue" | "neutral"> = {
  must: "blue",
  should: "blue",
  could: "neutral",
  wont: "neutral",
};

const PRIORITY_HINT: Record<RequirementPriority, string> = {
  must: "Imprescindible: el sistema no cumple su propósito sin esto.",
  should: "Importante, pero el sistema puede lanzarse sin esto si hace falta.",
  could: "Deseable si sobra tiempo o presupuesto, no crítico.",
  wont: "Se descarta por ahora, queda documentado para el futuro.",
};

const TYPE_HINT: Record<string, string> = {
  functional: "Describe algo que el sistema debe hacer (una acción o función concreta).",
  non_functional: "Describe una cualidad del sistema (seguridad, rendimiento, disponibilidad, etc.), no una acción.",
};

export function RequirementsList({ requirements }: { requirements: RequirementDto[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Cada requerimiento sigue la estructura ISO/IEC/IEEE 29148: tipo, prioridad MoSCoW, actor de origen,
        criterios Dado/Cuando/Entonces, reglas de negocio, dependencias y supuestos. Haz clic en cualquier texto
        para editarlo.
      </p>
      {requirements.map((req) => (
        <RequirementCard key={req.id} requirement={req} />
      ))}
    </div>
  );
}

function RequirementCard({ requirement }: { requirement: RequirementDto }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description);
  const [actor, setActor] = useState(requirement.actor ?? "");
  const [businessRules, setBusinessRules] = useState(requirement.businessRules ?? "");
  const [dependencies, setDependencies] = useState(requirement.dependencies ?? "");
  const [assumptions, setAssumptions] = useState(requirement.assumptions ?? "");

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/requirements/${requirement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    router.refresh();
  }

  async function saveEdit() {
    await patch({
      title,
      description,
      actor: actor || undefined,
      businessRules: businessRules || undefined,
      dependencies: dependencies || undefined,
      assumptions: assumptions || undefined,
    });
    setEditing(false);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <p className="font-accent text-xs text-muted">{requirement.code}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {saving && <Spinner className="h-3 w-3 text-qubit-blue-400" />}
          <span title={TYPE_HINT[requirement.type]} className="cursor-help">
            <CardBadge tone={requirement.type === "functional" ? "blue" : "neutral"}>
              {REQUIREMENT_TYPE_LABEL_ES[requirement.type]}
            </CardBadge>
          </span>
          <Select
            title="Prioridad (método MoSCoW)"
            value={requirement.priority}
            disabled={saving}
            onChange={(e) => patch({ priority: e.target.value })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p} title={PRIORITY_HINT[p]}>
                {REQUIREMENT_PRIORITY_LABEL_ES[p]}
              </option>
            ))}
          </Select>
          <Select
            title="Estado del requerimiento"
            value={requirement.status}
            disabled={saving}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {REQUIREMENT_STATUS_LABEL_ES[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium outline-none focus:border-qubit-blue-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Descripción</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Actor / Origen</label>
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Ej: Dueño de pyme de servicios"
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-qubit-blue-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Reglas de negocio</label>
            <Textarea value={businessRules} onChange={(e) => setBusinessRules(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Dependencias</label>
            <Textarea value={dependencies} onChange={(e) => setDependencies(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Supuestos y restricciones</label>
            <Textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveEdit} loading={saving} className="text-xs">
              Guardar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTitle(requirement.title);
                setDescription(requirement.description);
                setActor(requirement.actor ?? "");
                setBusinessRules(requirement.businessRules ?? "");
                setDependencies(requirement.dependencies ?? "");
                setAssumptions(requirement.assumptions ?? "");
                setEditing(false);
              }}
              disabled={saving}
              className="text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button className="mt-1 block w-full text-left" onClick={() => setEditing(true)} title="Haz clic para editar">
          <p className="font-accent font-medium hover:underline">{requirement.title}</p>
          <p className="mt-1 text-sm text-foreground/80">{requirement.description}</p>
          {requirement.actor && (
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-medium">Actor:</span> {requirement.actor}
            </p>
          )}
        </button>
      )}

      {requirement.acceptanceCriteria.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2">
          <p className="font-accent text-xs font-semibold text-muted">Criterios de aceptación</p>
          {requirement.acceptanceCriteria.map((c, i) => (
            <p key={i} className="text-xs text-foreground/80">
              <span className="font-medium">DADO</span> {c.given} <span className="font-medium">CUANDO</span> {c.when}{" "}
              <span className="font-medium">ENTONCES</span> {c.then}
            </p>
          ))}
        </div>
      )}

      {(requirement.businessRules || requirement.dependencies || requirement.assumptions) && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted">
          {requirement.businessRules && (
            <p>
              <span className="font-medium">Reglas de negocio:</span> {requirement.businessRules}
            </p>
          )}
          {requirement.dependencies && (
            <p>
              <span className="font-medium">Dependencias:</span> {requirement.dependencies}
            </p>
          )}
          {requirement.assumptions && (
            <p>
              <span className="font-medium">Supuestos:</span> {requirement.assumptions}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-muted">Versión {requirement.version}</p>
    </Card>
  );
}
