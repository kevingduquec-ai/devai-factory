import type { ProjectStatus } from "@devai-factory/shared-types";
import { CardBadge } from "@/components/ui/card";

const LABELS: Record<ProjectStatus, string> = {
  intake: "Esperando respuestas",
  ready_to_generate: "Listo para generar",
  generating: "Generando...",
  generated: "Generado",
  failed: "Falló",
};

const TONES: Record<ProjectStatus, "amber" | "blue" | "green" | "red"> = {
  intake: "amber",
  ready_to_generate: "blue",
  generating: "blue",
  generated: "green",
  failed: "red",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <CardBadge tone={TONES[status]} className={status === "generating" ? "animate-pulse" : ""}>
      {LABELS[status]}
    </CardBadge>
  );
}
