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
   ahí (incluyendo "textSnippets" — texto visible suelto como contadores,
   precios o mensajes de estado) — nunca inventes un botón, campo o texto
   que no está en ese mapa.
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
5. Cubre primero el camino principal de negocio, y agrega tantos casos
   alternos o negativos como el mapa funcional realmente sostenga (dato
   inválido, permiso denegado, campo vacío, límite de negocio, formato
   incorrecto) — nunca por relleno, pero tampoco te quedes corto: si el
   mapa muestra un formulario con varios campos, cada campo requerido
   amerita su propio caso de validación; si muestra una acción reversible
   (agregar/quitar, activar/desactivar), prueba también el camino inverso.
   Como referencia, un módulo con contenido real normalmente da para 4 a 8
   casos — menos que eso casi siempre significa que falta explorar el mapa,
   no que el módulo sea simple. Prioriza por severidad al ordenar, nunca
   para recortar cobertura real.
6. Si ya existe una precondición (te lo digo explícitamente), NUNCA repitas
   el login o la navegación de acceso — esos pasos ya viven ahí, no en tus
   casos. Si NO existe precondición todavía, el sistema no logró armar el
   acceso automáticamente — no te detengas ni asumas que ya hay sesión
   iniciada. Hay dos variantes según lo que muestre el mapa funcional de la
   página de arranque:
   6a. El mapa YA muestra un campo de contraseña (el formulario está a la
       vista): el caso principal empieza directo con los pasos de login
       usando el selector real de esos campos.
   6b. El mapa NO muestra ningún campo, pero SÍ un botón o link que por su
       texto es claramente el de iniciar sesión (ej. "Iniciar sesión",
       "Entrar", "Mi cuenta"): el formulario está detrás de ese clic (puede
       incluso llevar a un dominio externo de un tercero, ej. un login
       federado tipo Microsoft/Google/Okta). Tu caso principal debe empezar
       con un click usando el selector REAL de ese botón (tal como aparece
       en el mapa), seguido de los pasos de fill sobre selectores estándar
       razonables ya que el mapa todavía no los conoce. Para el campo de
       usuario usa un selector combinado que cubra las variantes más
       comunes: 'input[type="email"], input[type="text"]:not([type="hidden"])'
       — muchos logins federados (ej. Microsoft) usan type="text" o
       type="email" según el proveedor, nunca asumas uno solo. Para la
       contraseña, 'input[type="password"]' es estándar y confiable. Para
       el botón de envío, prioriza el texto visible si el mapa no lo dio
       (ej. 'text=Next', 'text=Siguiente', 'text=Iniciar sesión',
       'button[type="submit"]'). Describe estos selectores como "inferido,
       no confirmado en el mapa" en el step para que quede claro en el
       reporte si ese paso falla. Nunca omitas el click previo asumiendo
       que los campos ya están en pantalla.
   En ambos casos (6a y 6b) usa dataRef ("login_email"/"login_password",
   kind "secret") en vez de un valor literal para las credenciales, y su
   missingData correspondiente pidiendo la cuenta de prueba. Así el cliente
   responde una sola vez y el caso queda listo.
7. La precondición (o, si no existe, la página de arranque) deja al
   navegador en UNA sola página concreta (la que
   te digo explícitamente). Cada uno de tus casos EMPIEZA ahí — si lo que
   vas a verificar vive en otra pantalla (por ejemplo, un link del mapa
   funcional que lleva a otra ruta), el caso tiene que incluir, como
   primeros pasos, el click o goto que lo lleva hasta ahí, ANTES de
   cualquier fill o assert sobre esa pantalla. Nunca asumas que ya estás
   en la pantalla correcta solo porque la descripción la menciona.
8. El error más grave y más común en este trabajo: inventar CÓMO se ve el
   resultado exitoso, completando con suposición la parte que el mapa no
   confirma. Este es un caso real que ya pasó y que NUNCA debes repetir:
   el mapa mostraba el texto "Tu carrito está vacío" (un textSnippet real)
   y un botón "Agregar al carrito" — pero NINGUNA página mostraba jamás un
   contador con número, tipo "Mi carrito (0)" o "Carrito (1)". La
   respuesta incorrecta fue inventar que sí existía ese contador
   ("Mi carrito (1)") solo porque suena a como "suelen" verse los
   carritos de compra — eso NO es un hecho observado en este sitio, es un
   patrón genérico de e-commerce que puede o no aplicar acá. Ver un texto
   PARECIDO en el mapa (ej. "Tu carrito está vacío") no te autoriza a
   inventar una VARIANTE de ese texto con un número que nunca viste
   (ej. "Mi carrito (0)") — cada string que uses en value/assert_text
   tiene que ser una copia EXACTA de algo que aparece en headings,
   botones, links o textSnippets, carácter por carácter, nunca una
   versión "razonable" o "probable" de eso.
   Antes de escribir un expectedResult o un assert_text/wait_for_text,
   busca ese texto EXACTO en el mapa. Si no aparece tal cual:
   - Prefiere verificar algo que SÍ está confirmado en el mapa: un cambio
     de URL (assert_url), la aparición/desaparición de un elemento ya
     listado (assert_element_visible), o un texto real que el mapa sí
     muestra en otra parte de la pantalla (como "Tu carrito está vacío"
     desapareciendo, si eso SÍ está confirmado).
   - Si ninguna de esas alternativas prueba de verdad lo que el caso
     necesita verificar, NO inventes el texto — agrega un dataRef y su
     missingData (kind "business") preguntando exactamente qué texto o
     comportamiento visible confirma ese resultado en esta plataforma
     específica (ej. "¿qué texto exacto aparece cuando un producto se
     agrega al carrito?"). Es exactamente el mismo mecanismo que ya usas
     para credenciales — aplícalo también a comportamientos de la UI que
     no puedes confirmar con lo que tienes. Una pregunta honesta vale
     infinitamente más que una aserción que parece razonable pero prueba
     algo que nunca vas a ver en pantalla.`;

interface DiscoveredEl {
  text: string;
  selector: string;
}
interface DiscoveredPage {
  url: string;
  title: string;
  headings: string[];
  buttons: DiscoveredEl[];
  links: DiscoveredEl[];
  inputs: unknown[];
  textSnippets: string[];
}

/**
 * En Modo A (exploración completa) el mismo header/nav (logo, "Categorías",
 * "Hola, inicia sesión"...) aparece repetido en cada una de las páginas
 * rastreadas — con 8-9 páginas eso son cientos de líneas de JSON
 * redundante que solo infla el prompt y empujó una respuesta real a
 * truncarse a mitad de un string (Claude terminó gastando su presupuesto
 * de salida antes de cerrar el JSON). Factoriza lo que se repite en TODAS
 * las páginas a un solo bloque "elementos comunes", y deja cada página
 * solo con lo que tiene de único — misma información real, mucho menos
 * texto repetido.
 */
function compactDiscoveredStructure(pages: DiscoveredPage[]): unknown {
  if (pages.length <= 1) return { pages };

  function commonByText<T extends DiscoveredEl>(lists: T[][]): T[] {
    const [first, ...rest] = lists;
    return (first ?? []).filter((el) => rest.every((list) => list.some((o) => o.text === el.text)));
  }
  function commonStrings(lists: string[][]): string[] {
    const [first, ...rest] = lists;
    return (first ?? []).filter((s) => rest.every((list) => list.includes(s)));
  }

  const commonButtons = commonByText(pages.map((p) => p.buttons ?? []));
  const commonLinks = commonByText(pages.map((p) => p.links ?? []));
  const commonSnippets = commonStrings(pages.map((p) => p.textSnippets ?? []));

  const commonButtonTexts = new Set(commonButtons.map((b) => b.text));
  const commonLinkTexts = new Set(commonLinks.map((l) => l.text));
  const commonSnippetTexts = new Set(commonSnippets);

  return {
    elementosComunesEnTodasLasPaginas: { buttons: commonButtons, links: commonLinks, textSnippets: commonSnippets },
    pages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      headings: p.headings,
      inputs: p.inputs,
      buttons: (p.buttons ?? []).filter((b) => !commonButtonTexts.has(b.text)),
      links: (p.links ?? []).filter((l) => !commonLinkTexts.has(l.text)),
      textSnippets: (p.textSnippets ?? []).filter((s) => !commonSnippetTexts.has(s)),
    })),
  };
}

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
  const discoveredPages = (params.discoveredStructure as { pages?: DiscoveredPage[] } | undefined)?.pages ?? [];
  const startingPageNote =
    discoveredPages.length > 0
      ? discoveredPages.length === 1
        ? `\n\nLa precondición (o la URL base, si no hay precondición) deja al navegador exactamente en: ${discoveredPages[0]!.url} — esa es la única página en la que cada uno de tus casos empieza. Si necesitas otra pantalla, tu caso debe navegar ahí primero (regla 7).`
        : `\n\nLa precondición (o la URL base, si no hay precondición) deja al navegador exactamente en: ${discoveredPages[0]!.url} — ahí es donde cada uno de tus casos EMPIEZA. El sistema además navegó por su cuenta hasta ${discoveredPages.length - 1} pantalla(s) más relevante(s) para lo que describe el módulo (${discoveredPages
            .slice(1)
            .map((p) => p.url)
            .join(", ")}), y su mapa funcional también está incluido abajo — probablemente ahí es donde vive la funcionalidad real a probar. Si un caso necesita esa pantalla, sus primeros pasos deben navegar ahí desde la página de inicio (regla 7), usando el selector real del link/botón que la alcanza (visible en el mapa de la página de inicio).`
      : "";
  const compactStructure = discoveredPages.length > 0 ? compactDiscoveredStructure(discoveredPages) : undefined;
  const structureBlock = compactStructure
    ? `\n\nMapa funcional real detectado en la(s) página(s) del módulo (botones, links, campos, encabezados y textSnippets, con su selector exacto — "elementosComunesEnTodasLasPaginas" son los que se repiten igual en cada página, ej. el header; el resto de cada página es lo que tiene de único) — úsalo para que los selectores y textos de tus pasos coincidan con lo que de verdad existe, en vez de adivinar:\n"""${JSON.stringify(compactStructure)}"""`
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
    // Un mapa funcional real (varias páginas, con textSnippets) más la
    // cobertura más amplia que ahora se pide (regla 5: 4-8 casos) genera
    // una respuesta bastante más larga que antes — 8000 e incluso 16000 se
    // quedaron cortos y la respuesta llegaba truncada a mitad de un string
    // JSON (ver memoria del proyecto: nunca lowball max_tokens en etapas
    // que generan listas). Se sube con margen amplio; compactDiscoveredStructure
    // ya recorta la parte más pesada del lado del prompt de entrada.
    maxTokens: 24000,
  });
}
