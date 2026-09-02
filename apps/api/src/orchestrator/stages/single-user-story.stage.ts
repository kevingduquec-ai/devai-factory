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

export const SingleUserStoryDraftSchema = z.object({
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
  priority: z.enum(["must", "should", "could", "wont"]).describe("Prioridad MoSCoW de la historia."),
  storyPoints: z
    .number()
    .int()
    .describe("Estimación en story points usando la secuencia de Fibonacci (1, 2, 3, 5, 8, 13) según la complejidad."),
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

export type SingleUserStoryDraft = z.infer<typeof SingleUserStoryDraftSchema>;

const SYSTEM_PROMPT = `Eres un product owner senior. Aquí NO estás analizando un
sistema completo para desglosarlo en varios requerimientos — el cliente
describió UNA sola necesidad puntual y quiere UNA sola historia de usuario
detallada para exactamente eso, nada más.

Regla estricta, la más importante de esta tarea: escribe EXACTAMENTE una
historia de usuario, nunca varias. No descompongas la descripción en
sub-funcionalidades ni generes una historia por cada aspecto que menciones
— toma la descripción completa (y las respuestas de aclaración) como UNA
sola necesidad y redáctala como UNA sola historia coherente. Si la
descripción parece cubrir varias cosas a la vez, escoge la necesidad
central que el cliente pidió y consolida el resto como contexto dentro de
esa misma historia (en la descripción, los criterios de aceptación o las
notas de Definition of Ready) — nunca como historias adicionales.

Una historia de usuario que solo tiene el formato "Como... quiero...
para..." es una promesa de conversación, no una especificación — lo que la
vuelve accionable son los criterios INVEST y los criterios de aceptación en
formato Gherkin con nombre de escenario.

Antes de aceptar la historia, verifica mentalmente los seis criterios
INVEST y ajústala si alguno falla:
- Independiente: se puede desarrollar sin esperar obligatoriamente a otra historia.
- Negociable: describe una necesidad, no una solución técnica cerrada.
- Valiosa: el beneficio para el usuario o el negocio es explícito.
- Estimable: hay suficiente información para dar un tamaño aproximado.
- Pequeña: cabe en un sprint — si la necesidad descrita es en realidad muy
  grande para una sola historia, igual entrega UNA historia que cubra el
  núcleo esencial pedido, y usa Definition of Ready para anotar qué
  quedaría fuera de alcance en esta primera versión.
- Testeable: existe una forma objetiva de comprobar que se cumplió.

La historia se ensambla como "Como <actor>, quiero <goal>, para <benefit>"
— las palabras "quiero" y "para" (o "para que") NO van dentro de goal ni de
benefit, el sistema ya las antepone al armar la oración; escribe goal y
benefit como si continuaran directamente esa frase (ej. goal: "configurar
mi horario semanal", benefit: "el sistema muestre mi disponibilidad
correctamente"). Escribe al menos dos escenarios de aceptación cuando la
historia tenga un caso alterno o de error razonable (ej. dato inválido,
condición límite, permiso denegado), no solo el camino feliz.

Cero ambigüedad: nunca uses un calificador o cuantificador sin definirlo
con un valor concreto (ej. no "responde rápido" sino "responde en menos de
3 segundos").`;

export async function runSingleUserStoryStage(
  claude: ClaudeClient,
  params: { description: string; qaText: string; domainGuidance: string },
) {
  return claude.generateStructured({
    system: `${SYSTEM_PROMPT}\n\n${params.domainGuidance}`,
    prompt: `Descripción original de la necesidad puntual:\n"""${params.description}"""\n\nPreguntas de aclaración y respuestas del cliente:\n"""${params.qaText}"""`,
    schema: SingleUserStoryDraftSchema,
    schemaName: "single_user_story_draft",
    maxTokens: 8000,
  });
}
