import { z } from "zod";
import { ClaudeClient } from "../claude-client";

const QaStepSchema = z.object({
  action: z.enum(["goto", "click", "fill", "select", "wait_for_text", "assert_text", "assert_url", "assert_element_visible"]),
  selector: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Selector de Playwright: preferir texto visible ('text=Iniciar sesión') o atributos estables (data-testid, aria-label) sobre CSS genérico. Requerido en click/fill/select/assert_element_visible; no aplica en goto/assert_url.",
    ),
  value: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Texto a escribir, URL a visitar, opción a elegir, o texto esperado — según la acción. Si el valor real no se conoce todavía (ej. una contraseña de un rol específico), deja este campo en null y usa dataRef.",
    ),
  dataRef: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Clave corta en snake_case (ej. 'vendedor_password') SOLO cuando value es null porque el dato no se conoce — debe aparecer también como fieldKey en missingData del mismo caso. Nunca inventes un valor de relleno.",
    ),
  description: z.string().describe("Qué hace este paso, en español, en una frase corta — se muestra en el reporte."),
});

const QaMissingDataItemSchema = z.object({
  fieldKey: z.string().describe("Debe coincidir EXACTAMENTE con un dataRef usado en algún step de este mismo caso."),
  kind: z.enum(["secret", "business"]).describe("'secret' para credenciales/contraseñas (se cifran); 'business' para datos de negocio como un ID o un rango de precio (no se cifran)."),
  question: z.string().describe("Qué se necesita y para qué se usa, en una frase clara dirigida a quien va a responderla."),
  format: z.string().describe("Formato esperado, ej: 'correo y contraseña de un usuario con rol vendedor', 'texto libre', 'número entre 1 y 100'."),
});

const QaTestCaseDraftSchema = z.object({
  title: z.string().describe("Título corto y específico del caso de prueba."),
  severity: z.enum(["alta", "media", "baja"]).describe("Criticidad de negocio si este caso fallara en producción."),
  steps: z
    .array(QaStepSchema)
    .min(1)
    .describe("Pasos DENTRO del módulo (no repitas los pasos de acceso/login — esos ya los cubre la precondición del módulo)."),
  expectedResult: z
    .string()
    .describe(
      "El criterio de éxito objetivo y verificable (un mensaje visible, un cambio de URL, un dato reflejado en pantalla) — nunca una impresión subjetiva como 'funciona bien'.",
    ),
  missingData: z.array(QaMissingDataItemSchema).default([]).describe("Un ítem por cada dataRef usado en steps. Vacío si el caso no necesita ningún dato desconocido."),
});

const QaTestCasesResultSchema = z.object({
  testCases: z.array(QaTestCaseDraftSchema).min(1),
});

export type QaTestCaseDraft = z.infer<typeof QaTestCaseDraftSchema>;

const SYSTEM_PROMPT = `Eres un ingeniero de QA senior especializado en pruebas de caja
negra (black-box) sobre aplicaciones web reales — solo tienes la URL y lo
que se ve en pantalla, nunca el código fuente.

Estás en la Fase 2 (generación de casos) de un pipeline de automatización.
Ya existe una precondición (Fase 0) que deja al navegador exactamente en la
puerta del módulo a probar — login y navegación previa YA están resueltos
por esa precondición. Tu trabajo es generar casos de prueba SOLO para lo
que pasa DENTRO del módulo descrito, nunca para llegar hasta él.

Reglas estrictas:
1. Cada caso debe ser ejecutable por un script determinista (Playwright),
   nunca ambiguo. Cada paso tiene una acción concreta (goto/click/fill/
   select/wait_for_text/assert_text/assert_url/assert_element_visible) y,
   cuando aplica, un selector y un valor.
2. Selectores: prioriza texto visible o atributos estables (data-testid,
   aria-label, role) sobre CSS genérico o posicional — un CSS frágil rompe
   el script con el primer cambio de estilo. Si se te da un mapa funcional
   real de la página, usa EXACTAMENTE los selectores y textos que aparecen
   ahí — nunca inventes un botón, campo o texto que no está en ese mapa.
3. NUNCA inventes un dato que no tienes (una contraseña, un ID válido, un
   rango de precio de negocio). Si un paso necesita un valor que no se
   dio en la descripción, dejas value en null, pones un dataRef en
   snake_case, y agregas el ítem correspondiente en missingData con una
   pregunta clara. Esto es obligatorio — inventar un valor de relleno es
   el peor error posible aquí, porque produce una prueba que parece
   funcionar pero no prueba nada real.
4. El resultado esperado (expectedResult) tiene que ser un hecho objetivo
   y verificable por máquina: un mensaje de éxito visible, un código de
   estado, un cambio de URL, un dato reflejado en pantalla — nunca "se ve
   bien" o "funciona correctamente".
5. Cubre primero el camino principal de negocio, y agrega al menos un caso
   alterno o negativo razonable (dato inválido, permiso denegado, campo
   vacío) cuando aplique — prioriza por severidad, no por cantidad.
6. Si ya existe una precondición (te lo digo explícitamente), NUNCA repitas
   el login o la navegación de acceso — esos pasos ya viven ahí, no en tus
   casos. Si NO existe precondición todavía y el mapa funcional de la
   página de arranque muestra un campo de contraseña (un formulario de
   login), el sistema no logró armar el acceso automáticamente — no te
   detengas ni asumas que ya hay sesión iniciada: el caso principal debe
   empezar con los pasos de login usando el selector real de esos campos,
   con dataRef ("login_email"/"login_password", kind "secret") en vez de
   un valor literal, y su missingData correspondiente pidiendo la cuenta
   de prueba. Así el cliente responde una sola vez y el caso queda listo.
7. La precondición (o, si no existe, la página de arranque) deja al
   navegador en UNA sola página concreta (la que
   te digo explícitamente). Cada uno de tus casos EMPIEZA ahí — si lo que
   vas a verificar vive en otra pantalla (por ejemplo, un link del mapa
   funcional que lleva a otra ruta), el caso tiene que incluir, como
   primeros pasos, el click o goto que lo lleva hasta ahí, ANTES de
   cualquier fill o assert sobre esa pantalla. Nunca asumas que ya estás
   en la pantalla correcta solo porque la descripción la menciona.`;

export async function runQaTestCasesStage(
  claude: ClaudeClient,
  params: {
    moduleName: string;
    targetUrl: string;
    description: string;
    hasSetupSteps: boolean;
    discoveredStructure?: unknown;
  },
) {
  const discoveredPages = (params.discoveredStructure as { pages?: { url: string }[] } | undefined)?.pages ?? [];
  const startingPageNote =
    discoveredPages.length > 0
      ? `\n\nLa precondición (o la URL base, si no hay precondición) deja al navegador exactamente en: ${discoveredPages[0]!.url} — esa es la única página en la que cada uno de tus casos empieza. Si necesitas otra pantalla, tu caso debe navegar ahí primero (regla 7).`
      : "";
  const structureBlock = params.discoveredStructure
    ? `\n\nMapa funcional real detectado en la(s) página(s) del módulo (botones, links, campos y encabezados, con su selector exacto) — úsalo para que los selectores de tus pasos coincidan con lo que de verdad existe, en vez de adivinar:\n"""${JSON.stringify(params.discoveredStructure)}"""`
    : "";

  const prompt = `Módulo a probar: "${params.moduleName}"
URL base de la aplicación: ${params.targetUrl}
${params.hasSetupSteps ? "Ya existe una precondición de acceso (login + navegación) que deja al sistema listo en este módulo — no la repitas." : "Este módulo es la primera pantalla (no requiere login ni navegación previa)."}

Descripción de lo que hay que probar:
"""${params.description}"""${startingPageNote}${structureBlock}`;

  return claude.generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: QaTestCasesResultSchema,
    schemaName: "qa_test_cases",
    maxTokens: 8000,
  });
}
