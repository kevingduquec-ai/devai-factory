"use client";

import type { QaStepDto, QaStepAction } from "@devai-factory/shared-types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ACTIONS: { value: QaStepAction; label: string }[] = [
  { value: "goto", label: "Ir a URL" },
  { value: "click", label: "Clic" },
  { value: "fill", label: "Escribir texto" },
  { value: "select", label: "Elegir opción" },
  { value: "wait_for_text", label: "Esperar texto visible" },
  { value: "assert_text", label: "Verificar texto" },
  { value: "assert_url", label: "Verificar URL" },
  { value: "assert_element_visible", label: "Verificar elemento visible" },
];

const NEEDS_SELECTOR: QaStepAction[] = ["click", "fill", "select", "assert_element_visible"];
const NEEDS_VALUE: QaStepAction[] = ["goto", "fill", "select", "wait_for_text", "assert_text", "assert_url"];

function emptyStep(): QaStepDto {
  return { action: "click", selector: "", value: "", description: "" };
}

export function StepsEditor({ steps, onChange }: { steps: QaStepDto[]; onChange: (steps: QaStepDto[]) => void }) {
  function update(i: number, patch: Partial<QaStepDto>) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
          <span className="w-5 shrink-0 text-xs text-muted">{i + 1}.</span>
          <Select className="w-40 shrink-0" value={step.action} onChange={(e) => update(i, { action: e.target.value as QaStepAction })}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
          {NEEDS_SELECTOR.includes(step.action) && (
            <Input
              className="w-44"
              placeholder="Selector (ej: text=Entrar, #email)"
              value={step.selector ?? ""}
              onChange={(e) => update(i, { selector: e.target.value })}
            />
          )}
          {NEEDS_VALUE.includes(step.action) && (
            <Input
              className="w-44"
              placeholder={step.action === "goto" ? "URL (vacío = URL del módulo)" : "Valor / texto esperado"}
              value={step.value ?? ""}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          )}
          <Input
            className="min-w-40 flex-1"
            placeholder="Descripción del paso"
            value={step.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Quitar paso"
            className="shrink-0 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            ✕
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...steps, emptyStep()])}>
        + Agregar paso
      </Button>
    </div>
  );
}
