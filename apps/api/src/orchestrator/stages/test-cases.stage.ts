import { z } from "zod";
import { ClaudeClient } from "../claude-client";

export const TestCaseDraftSchema = z.object({
  criterionRef: z.string().describe("La referencia exacta AC-N del criterio de aceptación que prueba, tomada de la lista dada."),
  title: z.string().describe("Nombre corto y descriptivo del caso de prueba, ej: 'Envío de recordatorio a factura vencida hace 1 día'."),
  type: z.enum(["functional", "negative", "security", "integration", "regression", "performance"]),
  precondition: z.string().describe("Estado del sistema y de los datos antes de ejecutar el caso."),
  steps: z.array(z.string()).min(1).describe("Pasos numerados, uno por acción, concretos y ejecutables."),
  testData: z.string().describe("Valores concretos usados en la prueba (ej. montos, fechas, identificadores)."),
  expectedResult: z.string().describe("Qué debería observarse — se escribe antes de ejecutar, nunca el resultado real."),
  severity: z.enum(["alta", "media", "baja"]).describe("Severidad/prioridad del caso."),
});

export const TestCasesDraftListSchema = z.object({
  testCases: z
    .array(TestCaseDraftSchema)
    .min(1)
    .describe("Para cada criterio de aceptación, al menos un caso funcional; añade negativos/seguridad/integración/rendimiento donde aplique."),
});

export type TestCaseDraft = z.infer<typeof TestCaseDraftSchema>;

const SYSTEM_PROMPT = `Eres un QA senior que sigue las técnicas de diseño de
casos de prueba de ISTQB. Un caso de prueba solo es útil si otra persona
distinta a quien lo escribió puede ejecutarlo sin preguntar nada — eso
exige separar con precisión la precondición (qué debe existir antes), los
pasos (qué se hace, en orden), los datos de prueba (valores concretos) y el
resultado esperado (qué debe observarse, escrito antes de ejecutar, nunca
mezclado con un resultado real).

Antes de escribir los casos, aplica mentalmente estas técnicas:
- Partición de equivalencia: agrupa entradas que deberían comportarse
  igual y prueba una de cada grupo, en vez de repetir casos redundantes.
- Análisis de valores límite: prueba justo en el borde de cada condición
  (ej. exactamente en el límite, un valor antes, un valor después) — estos
  son los casos que más bugs reales encuentran y no deben faltar.

A partir de una lista de criterios de aceptación (formato Given/When/Then,
cada uno con una referencia AC-N), escribe casos de prueba concretos y
ejecutables. Para cada criterio, escribe al menos un caso funcional que lo
verifique directamente, con datos de prueba realistas (no genéricos como
"dato1"). Cuando el criterio lo amerite, añade también casos negativos, de
seguridad, de integración, de regresión o de rendimiento. Cada caso debe
referenciar exactamente la referencia AC-N del criterio que prueba, tomada
de la lista dada — no inventes otras referencias.

Cero ambigüedad: expectedResult siempre describe una observación
verificable objetivamente (un mensaje exacto, un estado exacto, un valor
exacto), nunca una frase vaga como "el sistema responde correctamente" o
"se comporta como se espera" sin decir qué es "correcto" en ese caso.`;

export async function runTestCasesStage(
  claude: ClaudeClient,
  criteria: { ref: string; given: string; when: string; then: string }[],
) {
  const prompt = `Criterios de aceptación:\n${criteria
    .map((c) => `${c.ref}: DADO ${c.given}, CUANDO ${c.when}, ENTONCES ${c.then}`)
    .join("\n")}`;

  return claude.generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: TestCasesDraftListSchema,
    schemaName: "test_cases_draft",
    maxTokens: 40000,
  });
}
