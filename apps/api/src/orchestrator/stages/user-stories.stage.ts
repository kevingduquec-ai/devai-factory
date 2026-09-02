import { z } from "zod";
import { ClaudeClient } from "../claude-client";

const GherkinScenarioSchema = z.object({
  scenarioName: z
    .string()
    .describe("Nombre corto del escenario, ej: 'Factura vencida hace 1 día' o 'Caso alterno: factura ya pagada'."),
  given: z.string().describe("DADO — contexto/estado inicial."),
  when: z.string().describe("CUANDO — la acción del usuario o del sistema."),
  then: z.string().describe("ENTONCES — el resultado esperado y verificable."),
});

export const UserStoryDraftSchema = z.object({
  requirementCode: z.string().describe("El código REQ-XXX del requerimiento al que pertenece esta historia, tomado exactamente de la lista dada."),
  title: z.string().describe("Título corto y descriptivo de la historia (menos de 10 palabras)."),
  actor: z.string().describe("Rol o persona específica, nunca 'usuario' genérico. Ej: 'dueño de una pyme de servicios'."),
  goal: z
    .string()
    .describe(
      "La acción o funcionalidad que quiere, sin la palabra 'quiero' — esa palabra la antepone el sistema. Ej: 'configurar mi horario semanal', no 'quiero configurar mi horario semanal'.",
    ),
  benefit: z
    .string()
    .describe(
      "El beneficio u objetivo de negocio, sin las palabras 'para' o 'para que' al inicio — esas palabras las antepone el sistema. Ej: 'el sistema muestre mi disponibilidad correctamente', no 'para que el sistema muestre mi disponibilidad correctamente'.",
    ),
  priority: z.enum(["must", "should", "could", "wont"]).describe("Prioridad MoSCoW de la historia (normalmente hereda la del requerimiento)."),
  storyPoints: z
    .number()
    .int()
    .describe("Estimación en story points usando la secuencia de Fibonacci (1, 2, 3, 5, 8, 13) según la complejidad relativa."),
  dependencies: z.string().optional().describe("Otras historias o integraciones de las que depende. Vacío si no aplica."),
  definitionOfReady: z
    .string()
    .describe("Qué debe estar listo antes de empezar a desarrollarla (requisitos claros, mockups si aplica, dependencias identificadas)."),
  definitionOfDone: z
    .string()
    .describe("Qué debe cumplirse para considerarla terminada (código revisado, pruebas pasando, validado por el dueño de producto)."),
  acceptanceCriteria: z
    .array(GherkinScenarioSchema)
    .min(1)
    .describe(
      "Al menos dos escenarios cuando aplique: el camino principal, y un caso alterno o de error — cada uno con nombre de escenario.",
    ),
});

export const UserStoriesDraftListSchema = z.object({
  stories: z
    .array(UserStoryDraftSchema)
    .min(1)
    .describe(
      "Exactamente una historia de usuario por cada requerimiento de la lista dada — funcional y no funcional, sin excepción y sin omitir ninguno.",
    ),
});

export type UserStoryDraft = z.infer<typeof UserStoryDraftSchema>;

const SYSTEM_PROMPT = `Eres un product owner senior. Una historia de usuario que
solo tiene el formato "Como... quiero... para..." es una promesa de
conversación, no una especificación — lo que la vuelve accionable son los
criterios INVEST y los criterios de aceptación en formato Gherkin con
nombre de escenario.

Antes de aceptar cada historia, verifica mentalmente los seis criterios
INVEST y ajústala si alguno falla:
- Independiente: se puede desarrollar sin esperar obligatoriamente a otra historia.
- Negociable: describe una necesidad, no una solución técnica cerrada.
- Valiosa: el beneficio para el usuario o el negocio es explícito.
- Estimable: hay suficiente información para dar un tamaño aproximado.
- Pequeña: cabe en un sprint — si no cabe, divídela en varias historias.
- Testeable: existe una forma objetiva de comprobar que se cumplió.

A partir de una lista de requerimientos ya definidos (con su código
REQ-XXX), escribe EXACTAMENTE una historia de usuario por cada
requerimiento de la lista — sin excepción. Esto incluye a los
requerimientos no funcionales (rendimiento, seguridad, disponibilidad,
cumplimiento): enmárcalos como una expectativa del usuario o del negocio
en primera persona (ej. para "el sistema debe responder en menos de 3
segundos", una historia válida es "Como cliente que busca disponibilidad,
quiero que la búsqueda responda en menos de 3 segundos, para no abandonar
la reserva por lentitud"). El cliente está pagando por un paquete de
análisis completo — un requerimiento sin su historia correspondiente es un
entregable incompleto, nunca lo dejes así. Cada requerimiento de la lista
dada debe aparecer exactamente una vez como requirementCode en tu
respuesta antes de terminar; revisa la lista completa al final y agrega la
historia que falte si encuentras alguna omitida.

Las historias se ensamblan como "Como <actor>, quiero <goal>, para
<benefit>" — las palabras "quiero" y "para" (o "para que") NO van dentro
de goal ni de benefit, el sistema ya las antepone al armar la oración;
escribe goal y benefit como si continuaran directamente esa frase (ej.
goal: "configurar mi horario semanal", benefit: "el sistema muestre mi
disponibilidad correctamente"). Cada historia debe referenciar el código
REQ-XXX exacto del requerimiento del que viene — usa exactamente los
códigos de la lista dada, no inventes otros. Escribe al menos dos
escenarios de aceptación cuando la historia tenga un caso alterno o de
error razonable (ej. dato inválido, condición límite, permiso denegado),
no solo el camino feliz.`;

export async function runUserStoriesStage(
  claude: ClaudeClient,
  requirements: { code: string; title: string; description: string; type: string; priority: string }[],
) {
  const prompt = `Requerimientos:\n${requirements
    .map((r) => `${r.code} [${r.type}, prioridad ${r.priority}] ${r.title}: ${r.description}`)
    .join("\n")}`;

  return claude.generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: UserStoriesDraftListSchema,
    schemaName: "user_stories_draft",
    maxTokens: 40000,
  });
}
