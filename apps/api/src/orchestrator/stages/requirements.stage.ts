import { z } from "zod";
import { ClaudeClient } from "../claude-client";

const AcceptanceCriterionSchema = z.object({
  given: z.string().describe("DADO — contexto o estado inicial."),
  when: z.string().describe("CUANDO — la acción que ocurre."),
  then: z.string().describe("ENTONCES — el resultado esperado y verificable."),
});

export const RequirementDraftSchema = z.object({
  title: z.string().describe("Título corto (menos de 10 palabras)."),
  description: z
    .string()
    .describe(
      "Una sola oración con el formato: 'El sistema debe/deberá [acción] para que [objetivo de negocio]'. Nunca describas una solución técnica, solo el qué y el para qué.",
    ),
  type: z.enum(["functional", "non_functional"]),
  priority: z.enum(["must", "should", "could", "wont"]).describe("Prioridad MoSCoW."),
  actor: z
    .string()
    .describe("Origen/Actor: qué rol o persona lo solicitó y quién lo usa (ej: 'Dueño de pyme de servicios')."),
  acceptanceCriteria: z
    .array(AcceptanceCriterionSchema)
    .min(1)
    .describe("Al menos un criterio Dado/Cuando/Entonces que hace verificable el requerimiento."),
  businessRules: z
    .string()
    .optional()
    .describe("Reglas de negocio asociadas (cálculos, plazos, excepciones). Vacío si no aplica."),
  dependencies: z
    .string()
    .optional()
    .describe("Otros requerimientos o sistemas de los que depende. Vacío si no aplica."),
  assumptions: z
    .string()
    .optional()
    .describe("Lo que se asume verdadero y lo que limita la solución. Vacío si no aplica."),
});

export const RequirementsDraftListSchema = z.object({
  requirements: z
    .array(RequirementDraftSchema)
    .min(4)
    .describe("Lista de requerimientos funcionales y no funcionales, sin numerar todavía."),
});

export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;

const SYSTEM_PROMPT_BASE = `Eres un analista de requerimientos senior que sigue
la estructura de la norma ISO/IEC/IEEE 29148, adaptada sin burocracia
innecesaria. Un requerimiento mal escrito casi siempre falla en una de
cuatro pruebas: es ambiguo, no es verificable, no dice quién lo pidió o por
qué, o no se puede rastrear. Tu tarea es que ningún requerimiento falle
ninguna de las cuatro.

A partir de la descripción original de una necesidad de software y las
respuestas del cliente a las preguntas de aclaración, produce la lista
completa de requerimientos funcionales y no funcionales. Reglas:
- La descripción es SIEMPRE una sola oración: "El sistema debe/deberá
  [acción] para que [objetivo de negocio]" — verbo modal + acción +
  propósito de negocio, nunca una solución técnica ("usar Redis para...").
- El actor/origen debe ser específico (un rol real mencionado o implícito
  en la conversación), nunca "el usuario" genérico.
- Cada requerimiento necesita al menos un criterio de aceptación
  Dado/Cuando/Entonces verificable — si no se puede verificar objetivamente,
  no está completo.
- Incluye siempre al menos 2 requerimientos no funcionales (seguridad,
  rendimiento, disponibilidad, cumplimiento, según aplique), cada uno con
  su propio criterio de aceptación medible (ej. "en menos de 3 segundos",
  "99% de disponibilidad"), no solo una intención vaga.
- No repitas el mismo requerimiento con distintas palabras.
- No inventes reglas de negocio, dependencias o supuestos que el cliente no
  mencionó ni implicó — dejar esos campos vacíos es preferible a inventar.
- Cero ambigüedad: nunca uses un calificador o cuantificador sin definirlo
  con un valor concreto en la misma oración. Palabras como "rápido",
  "varios", "algunos", "varios tipos", "varios roles", "adecuado",
  "suficiente", "en poco tiempo" o "un límite razonable" están prohibidas
  a menos que vayan seguidas del número, rango o lista exacta que las hace
  verificables (ej. no "varios roles de usuario" sino "los roles
  administrador, barbero y cliente"; no "responde rápido" sino "responde en
  menos de 3 segundos"). Si la conversación con el cliente no dio el valor
  exacto, usa el valor típico del dominio y dilo explícitamente en el
  criterio de aceptación en vez de dejarlo abierto.`;

export async function runRequirementsStage(
  claude: ClaudeClient,
  params: { description: string; qaText: string; domainGuidance: string },
) {
  return claude.generateStructured({
    system: `${SYSTEM_PROMPT_BASE}\n\n${params.domainGuidance}`,
    prompt: `Descripción original:\n"""${params.description}"""\n\nPreguntas de aclaración y respuestas del cliente:\n"""${params.qaText}"""`,
    schema: RequirementsDraftListSchema,
    schemaName: "requirements_draft",
  });
}
