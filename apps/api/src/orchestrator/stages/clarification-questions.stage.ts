import { z } from "zod";
import { ClaudeClient } from "../claude-client";
import type { IntakeSummary } from "./intake.stage";

export const ClarificationQuestionsSchema = z.object({
  questions: z
    .array(z.string())
    .min(4)
    .max(8)
    .describe("Entre 4 y 8 preguntas específicas y accionables para aclarar la necesidad."),
});

export type ClarificationQuestions = z.infer<typeof ClarificationQuestionsSchema>;

const SYSTEM_PROMPT = `Eres un analista de requerimientos senior. A partir del resumen
estructurado de una necesidad de software, genera entre 4 y 8 preguntas de
aclaración concretas. El objetivo no es "conversar" — es reunir exactamente
la información que hace falta para poder escribir después un requerimiento
completo y verificable para cada funcionalidad. Cubre, según aplique a la
necesidad descrita:

- Actores/roles: quién usa cada funcionalidad y con qué diferencias de permiso.
- Volumen y escala: cuántos usuarios, registros o transacciones maneja hoy y a futuro.
- Reglas de negocio: cálculos, validaciones, plazos o excepciones que gobiernan el comportamiento (no asumas ninguna que el cliente no haya mencionado).
- Dependencias: sistemas, datos o integraciones externas de los que depende la solución.
- Pagos e integraciones: si aplica, cómo se procesan y con qué canal.
- Supuestos y restricciones: qué debe existir para que la solución funcione (ej. un canal de contacto válido, un catálogo ya cargado).

No hagas preguntas genéricas de manual ("¿qué tecnología prefieres?"); cada
pregunta debe ser algo que, sin responder, dejaría un hueco real en el
requerimiento final.`;

export async function runClarificationQuestionsStage(
  claude: ClaudeClient,
  description: string,
  summary: IntakeSummary,
) {
  return claude.generateStructured({
    system: SYSTEM_PROMPT,
    prompt: `Descripción original:\n"""${description}"""\n\nResumen estructurado:\n${JSON.stringify(summary, null, 2)}`,
    schema: ClarificationQuestionsSchema,
    schemaName: "clarification_questions",
  });
}
