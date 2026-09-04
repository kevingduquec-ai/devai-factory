import { z } from "zod";
import { ClaudeClient } from "../claude-client";

const QaStepSchema = z.object({
  action: z.enum(["goto", "click", "fill", "select", "wait_for_text", "assert_text", "assert_url", "assert_element_visible"]),
  selector: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Selector de Playwright: preferir texto visible ('text=Iniciar sesión') o atributos estables (data-testid, aria-label) sobre CSS genérico. Si no hay certeza sobre cuál de dos selectores es el correcto, se pueden combinar separados por coma (ej. 'input[type=\"email\"], input[type=\"text\"]') — el runtime los prueba en orden como alternativas reales, cada una puede ser CSS o 'text=...' sin restricción, no como una lista CSS literal. Requerido en click/fill/select/assert_element_visible; no aplica en goto/assert_url.",
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
      "Clave corta en snake_case (ej. 'vendedor_password') SOLO cuando value es null porque el dato no se conoce — debe aparecer también como fieldKey en missingData de ESTE MISMO caso, sin excepción, incluso si otro caso de esta misma lista ya pide un dato con el mismo nombre: los casos se ejecutan de forma completamente independiente, cada uno con su propia respuesta resuelta, y un dataRef sin su missingData en el caso que lo usa hace que ese caso falle en tiempo de ejecución con 'falta el dato'. Nunca inventes un valor de relleno.",
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
  // Sin mínimo a propósito: cuando ya existen casos de una corrida
  // anterior (ver existingCaseTitles), una lista vacía es la respuesta
  // correcta si el mapa no da para nada genuinamente nuevo — exigir al
  // menos 1 empujaría al modelo a inventar un duplicado disfrazado.
  testCases: z.array(QaTestCaseDraftSchema),
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
   para recortar cobertura real. Esa referencia NUNCA es una cuota que
   rellenar: si el mapa es genuinamente angosto (ej. una sola pantalla con
   un botón y sin formulario visible), 3 o 4 casos distintos y reales
   valen más que forzar 8. Antes de entregar la lista, revísala: dos casos
   son el MISMO caso disfrazado si prueban la misma acción de usuario con
   el mismo resultado, aunque el texto del nombre, la severidad o el
   fieldKey del missingData sean distintos (ej. "login exitoso" con
   dataRef 'login_success_indicator' y otro "login exitoso" casi idéntico
   con dataRef 'login_success_url' son EL MISMO caso — combínalos en uno
   solo). Elimina o fusiona cualquier par así antes de responder.
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
       IMPORTANTE sobre logins federados en 6b: la mayoría (Microsoft,
       Google, Okta y clones) muestran el correo/usuario en UNA pantalla y
       la contraseña en OTRA pantalla posterior (tras un botón intermedio
       tipo "Next"/"Siguiente") — no un formulario combinado. El runtime ya
       maneja esa transición automáticamente cuando el fill de contraseña
       falla justo después de llenar el correo, así que escribe tus pasos
       como si fuera un solo formulario (fill correo, fill contraseña,
       click enviar) — no necesitas modelar el click intermedio tú mismo.
       Pero SÍ ten en cuenta esto al escribir el resultado esperado: (a) un
       caso que solo busca confirmar "el click revela el formulario de
       login" debe verificar que aparece el CAMPO DE CORREO/USUARIO — no el
       de contraseña, porque no puedes saber si aparecen juntos o en
       pantallas separadas; (b) para CUALQUIER caso que necesite llegar
       hasta la pantalla de contraseña — no solo "credenciales inválidas",
       también "contraseña vacía", "login exitoso", o cualquier otro que
       incluya un fill sobre el campo de contraseña — el correo usado tiene
       que corresponder a una cuenta REAL, vía dataRef y su missingData
       ("¿cuál es una cuenta de prueba VÁLIDA/registrada en esta
       plataforma?"), NUNCA un correo inventado tipo "usuario@ejemplo.com".
       Un correo inventado no corresponde a ninguna cuenta real, así que
       el proveedor externo puede rechazarlo en la PRIMERA pantalla (antes
       de siquiera mostrar el campo de contraseña) — el caso real que ya
       expuso este error: un caso de "contraseña vacía" usó
       "usuario@ejemplo.com" como correo y nunca llegó a ver el campo de
       contraseña, porque el proveedor lo rechazó de entrada; el fallo
       resultante no probaba nada real sobre la aplicación, solo el error
       de haber usado un correo que no existe. Cualquier caso cuyo
       objetivo dependa de alcanzar la pantalla de contraseña necesita esa
       misma cuenta real — puedes reutilizar el mismo dataRef
       "login_email" en varios casos (cada uno con su propio missingData,
       ver la nota sobre dataRef en la definición del step).
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
     algo que nunca vas a ver en pantalla.
9. Un caso de "campo obligatorio vacío" casi nunca puede verificarse con
   assert_text/wait_for_text: la mayoría de formularios usan la validación
   NATIVA del navegador (el atributo required de HTML), que muestra un
   globo/tooltip del propio navegador — no es texto del DOM, y ningún
   selector puede leerlo. Para ese tipo de caso, verifica en cambio algo
   que sí es real y observable: que la URL no cambió (assert_url con el
   mismo fragmento de la página del formulario) o que el campo/formulario
   sigue visible (assert_element_visible) — nunca un assert_text con el
   mensaje de validación que "el navegador debería mostrar".
10. Un caso que prueba "el formulario NO avanza si dejo X vacío/inválido"
    termina sus pasos de interacción justo en el click/submit que dispara
    esa validación — nunca sigas llenando o haciendo click en campos que
    solo existirían SI esa validación hubiera pasado. Esto es crítico en
    logins de dos pasos (correo → botón Siguiente → contraseña, típico de
    Microsoft/Google y clones): si el caso deja el correo vacío a propósito,
    el campo de contraseña nunca aparece en pantalla — un paso de tipo fill
    sobre ese campo no es "un paso más", es un error de diseño del caso que
    va a fallar por timeout sin que exista ningún bug real en la
    aplicación. La secuencia correcta es: completar (o dejar vacío,
    según lo que el caso prueba) solo el campo bajo prueba, click en el
    botón de envío/siguiente, y verificar ahí mismo con assert_url o
    assert_element_visible (ver regla 9) — nunca avanzar a un paso
    posterior del flujo.
11. Cuando el botón de acceso (regla 6b) navega a un dominio externo
    CONFIRMADO por el mapa (login federado tipo Microsoft/Google/Okta), esa
    navegación YA ocurrió desde el primer click — ningún paso posterior,
    sea cual sea el caso, puede esperar seguir en la URL del sitio
    original. Verifica en cambio que la URL SÍ contiene el dominio/ruta del
    proveedor externo (si el mapa lo mostró) o usa assert_element_visible
    sobre el campo que sigue en pantalla.
    Y en el caso más común — regla 6b sin que el mapa confirme a dónde
    lleva el click, que es la situación por defecto — NO sabes si el
    formulario aparece en el mismo dominio o si navega a uno externo, así
    que cualquier aserción sobre la URL después de ese click es una
    apuesta: si adivinas mal (como pasó en un caso real: se asumió que el
    login era interno y el sitio en realidad federa a Microsoft, así que
    la URL real después del click nunca vuelve a contener la ruta
    original), el caso reporta un fallo que no es un bug de la aplicación,
    sino un error de tu propia suposición. Para estos casos (6b sin
    confirmar), en cualquier caso que verifique que el formulario NO avanza
    (campo vacío, credenciales inválidas, etc.), usa SIEMPRE
    assert_element_visible sobre el campo o botón que sigue en pantalla —
    NUNCA assert_url — porque esa aserción es válida sin importar si el
    login terminó siendo interno o federado.`;

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

/** Forma mínima que este módulo necesita de LoginInvestigationResult (playwright-discovery.ts) — se declara localmente en vez de importarla para no acoplar la capa de orquestación a la de ejecución de QA. */
interface ConfirmedLoginFlow {
  loginClickSelector: string | null;
  isTwoStep: boolean;
  emailSelector: string;
  nextSelector: string | null;
  passwordSelector: string;
  submitSelector: string;
  happyPath: { finalUrl: string; headings: string[]; textSnippets: string[] } | null;
  wrongPassword: { finalUrl: string; headings: string[]; textSnippets: string[]; stayedOnPasswordScreen: boolean } | null;
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
    existingCaseTitles?: string[];
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

  const existingCasesBlock =
    params.existingCaseTitles && params.existingCaseTitles.length > 0
      ? `\n\nEste módulo YA tiene estos casos generados en una corrida anterior — NO los repitas ni generes una variante casi idéntica de ninguno (mismo título, mismo escenario con severidad o nombre distinto, o el mismo dato pedido con otra redacción). Genera SOLO casos que cubran un escenario genuinamente distinto de todos estos:\n${params.existingCaseTitles.map((t) => `- ${t}`).join("\n")}\nSi el mapa no da para casos realmente nuevos más allá de estos, devuelve una lista vacía en vez de duplicar.`
      : "";

  const confirmedLoginFlow = (params.discoveredStructure as { confirmedLoginFlow?: ConfirmedLoginFlow } | undefined)
    ?.confirmedLoginFlow;
  const confirmedLoginBlock = confirmedLoginFlow
    ? `\n\nIMPORTANTE — el login de este módulo YA fue investigado en vivo con las credenciales reales del cliente (no es una suposición, es lo que de verdad pasó al probarlo): ${
        confirmedLoginFlow.isTwoStep
          ? `es un login en DOS pantallas separadas (correo primero, contraseña después de un click intermedio).`
          : `es un login de UNA sola pantalla (correo y contraseña juntos).`
      } Usa EXACTAMENTE estos selectores confirmados, sin inventar alternativas ni describirlos como "inferido" — ya no lo son:
- Click para revelar el formulario: ${confirmedLoginFlow.loginClickSelector ? `"${confirmedLoginFlow.loginClickSelector}"` : "no hizo falta, el formulario ya estaba a la vista"}
- Campo de correo/usuario: "${confirmedLoginFlow.emailSelector}"
${confirmedLoginFlow.isTwoStep ? `- Click para avanzar a la pantalla de contraseña: "${confirmedLoginFlow.nextSelector}"\n` : ""}- Campo de contraseña: "${confirmedLoginFlow.passwordSelector}"
- Botón de envío final (con ambos campos ya llenos): "${confirmedLoginFlow.submitSelector}"
${confirmedLoginFlow.isTwoStep ? `Para un caso que deja el correo vacío: el click de envío en ESA pantalla es el mismo botón de avanzar ("${confirmedLoginFlow.nextSelector}"), NUNCA el botón de envío final — ese pertenece a la segunda pantalla, a la que un correo vacío nunca llega.\n` : ""}${
        confirmedLoginFlow.happyPath
          ? `Resultado real observado con credenciales correctas: URL final "${confirmedLoginFlow.happyPath.finalUrl}", encabezados visibles [${confirmedLoginFlow.happyPath.headings.map((h) => `"${h}"`).join(", ")}]. Usa este encabezado tal cual (o el fragmento de URL) como criterio de éxito del login — es un hecho observado, no necesitas preguntarlo como missingData.\n`
          : ""
      }${
        confirmedLoginFlow.wrongPassword
          ? `Resultado real observado con contraseña incorrecta (mismo correo real): ${confirmedLoginFlow.wrongPassword.stayedOnPasswordScreen ? "el campo de contraseña sigue visible" : "no permanece en la pantalla de contraseña"}, encabezados visibles [${confirmedLoginFlow.wrongPassword.headings.map((h) => `"${h}"`).join(", ")}]. Usa esto tal cual para el caso de credenciales inválidas — también es un hecho observado.\n`
          : ""
      }`
    : "";

  const prompt = `Módulo a probar: "${params.moduleName}"
URL base de la aplicación: ${params.targetUrl}
${params.hasSetupSteps ? "Ya existe una precondición de acceso (login + navegación) que deja al sistema listo en este módulo — no la repitas." : "Este módulo es la primera pantalla (no requiere login ni navegación previa)."}

Descripción de lo que hay que probar:
"""${params.description}"""${startingPageNote}${structureBlock}${existingCasesBlock}${confirmedLoginBlock}`;

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
