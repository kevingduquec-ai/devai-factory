import { chromium, type Page } from "playwright";
import type { QaStep } from "./qa-step.types";

export interface DiscoveredElement {
  text: string;
  selector: string;
}
export interface DiscoveredInput {
  label: string;
  selector: string;
  type: string;
}
export interface PageStructure {
  url: string;
  title: string;
  headings: string[];
  buttons: DiscoveredElement[];
  links: DiscoveredElement[];
  inputs: DiscoveredInput[];
  /** Texto visible suelto (contadores, badges, mensajes de estado) que no es botón/link/encabezado — sin esto, un assert_text sobre "cuántos productos hay en el carrito" o similar no tiene ningún dato real con qué compararse, y el generador de casos termina inventando el texto. */
  textSnippets: string[];
}

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ELEMENTS = 25;

/**
 * Muchas apps reales son SPA pesadas (Angular, React) — el evento "load" de
 * Playwright dispara en cuanto llega el HTML/JS inicial, mucho antes de que
 * el framework termine de arrancar y pintar botones/campos reales. Sin
 * esperar aquí, discoverPageStructure() puede capturar una página
 * literalmente vacía (0 botones, 0 links, 0 campos) que no refleja nada de
 * lo que un usuario real ve. networkidle no siempre dispara (analítica,
 * websockets, polling), así que se usa como mejor esfuerzo y de todos
 * modos se suma una espera fija corta como piso.
 */
/**
 * Microsoft (y otros IdP federados) muestran un interstitial "Stay signed
 * in?" / "¿Mantener la sesión iniciada?" justo después de validar
 * credenciales correctamente y ANTES de devolver el control a la app real
 * — caso real que ya pasó: un login con credenciales válidas "fallaba"
 * porque el navegador se quedaba parado en esta pantalla para siempre,
 * nunca porque el login hubiera fallado de verdad. Se descarta con "No"
 * — la opción más segura para pruebas automatizadas, ya que "Yes" deja
 * una cookie de sesión persistente entre corridas que no queremos. Best
 * effort en cada sentido: si la pantalla no aparece, no hace nada; si el
 * intento de descartarla falla por lo que sea, nunca rompe el flujo
 * principal del caso.
 */
async function dismissKnownInterstitials(page: Page): Promise<void> {
  try {
    const stayLoggedInPrompt = page.getByText(/stay signed in\?|¿mantener.*sesión|seguir conectado/i).first();
    const visible = await stayLoggedInPrompt.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) return;
    const dismissButton = page.getByRole("button", { name: /^no$/i }).first();
    const hasDismissButton = (await dismissButton.count().catch(() => 0)) > 0;
    if (!hasDismissButton) return;
    await dismissButton.click({ timeout: 3000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  } catch {
    // best-effort — nunca debe romper el flujo principal del caso
  }
}

export async function settleAfterNavigation(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await dismissKnownInterstitials(page);
}

/**
 * Extrae un mapa funcional liviano de la página actual (Fase 1 del módulo):
 * qué botones, links, campos y encabezados tiene, con un selector estable
 * para cada uno — preferimos data-testid / id / aria-label sobre CSS
 * posicional, igual que exige la sección 8 del módulo. Este mapa es lo que
 * luego se le pasa a Claude para que proponga selectores REALES en vez de
 * adivinar cómo se llama un botón.
 */
export async function discoverPageStructure(page: Page): Promise<PageStructure> {
  return page.evaluate((maxElements) => {
    function stableSelector(el: Element): string {
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      if (el.id) return `#${el.id}`;
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
      const text = (el.textContent || "").trim();
      if (text && text.length < 60) return `text=${text}`;
      const name = el.getAttribute("name");
      if (name) return `[name="${name}"]`;
      return el.tagName.toLowerCase();
    }

    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a.button, input[type="submit"]'))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .slice(0, maxElements)
      .map((el) => ({ text: (el.textContent || (el as HTMLInputElement).value || "").trim().slice(0, 80), selector: stableSelector(el) }))
      .filter((b) => b.text.length > 0);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .slice(0, maxElements)
      .map((el) => ({ text: (el.textContent || "").trim().slice(0, 80), selector: (el as HTMLAnchorElement).getAttribute("href") || "" }))
      .filter((l) => l.text.length > 0 && l.selector.length > 0);

    const inputs = Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .slice(0, maxElements)
      .map((el) => {
        const input = el as HTMLInputElement;
        const labelEl = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
        const label = (labelEl?.textContent || input.getAttribute("placeholder") || input.getAttribute("aria-label") || input.name || "").trim();
        return { label, selector: stableSelector(el), type: input.type || el.tagName.toLowerCase() };
      })
      .filter((i) => i.label.length > 0);

    const headings = Array.from(document.querySelectorAll("h1, h2"))
      .map((el) => (el.textContent || "").trim())
      .filter((t) => t.length > 0)
      .slice(0, 10);

    // Texto visible que NO es botón/link/input/encabezado: contadores de
    // carrito, badges, mensajes de confirmación, precios, estados — lo que
    // un caso normalmente necesita para un assert_text real. Solo nodos
    // hoja (sin hijos) para no capturar contenedores enteros con texto
    // repetido, y se descarta lo que ya vive dentro de un control
    // interactivo (ya cubierto arriba).
    const seenTexts = new Set<string>([...buttons.map((b) => b.text), ...links.map((l) => l.text), ...headings]);
    const textSnippets: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (textSnippets.length >= 18) break;
      if (!(el instanceof HTMLElement)) continue;
      if (el.offsetParent === null) continue;
      if (el.closest('button, a, [role="button"], input, select, textarea')) continue;
      if (el.children.length > 0) continue;
      const text = (el.textContent || "").trim();
      if (text.length === 0 || text.length > 50) continue;
      if (seenTexts.has(text)) continue;
      seenTexts.add(text);
      textSnippets.push(text);
    }

    return { url: window.location.href, title: document.title, headings, buttons, links, inputs, textSnippets };
  }, MAX_ELEMENTS);
}

/**
 * Muchos formularios reales (sobre todo logins federados de terceros como
 * Microsoft/Google, con markup generado/ofuscado) no traen id, name ni
 * data-testid en sus campos — stableSelector() solo con esos atributos
 * devolvía "" y la detección se rendía aunque el campo estuviera ahí,
 * visible y llenable. Como estas funciones ya saben qué TIPO de campo
 * buscan (password, email/texto), el fallback final usa el atributo type
 * — el propio atributo que se usó para encontrarlo — así siempre queda un
 * selector válido en vez de perder el campo por falta de otros atributos.
 */

/** Busca en la página actual un formulario de login (campo de correo/usuario + contraseña + botón de envío). */
export async function detectLoginForm(page: Page): Promise<{ emailSelector: string; passwordSelector: string; submitSelector: string } | null> {
  const result = await page.evaluate(() => {
    function stableSelector(el: Element): string {
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      if (el.id) return `#${el.id}`;
      const name = el.getAttribute("name");
      if (name) return `[name="${name}"]`;
      return "";
    }
    const passwordInput = document.querySelector('input[type="password"]');
    if (!passwordInput) return null;
    const emailInput =
      document.querySelector('input[type="email"]') ||
      document.querySelector(
        'input[name="email"], input[id="email"], input[autocomplete="username"], input[name*="user" i], input[id*="user" i], input[placeholder*="correo" i], input[placeholder*="email" i], input[placeholder*="usuario" i]',
      ) ||
      Array.from(document.querySelectorAll('input[type="text"]'))[0];
    if (!emailInput) return null;
    const form = passwordInput.closest("form");
    const submitBtn = form?.querySelector('button[type="submit"], button:not([type])') || document.querySelector('button[type="submit"]');
    const submitSelector = submitBtn
      ? (submitBtn.textContent || "").trim().length > 0
        ? `text=${(submitBtn.textContent || "").trim()}`
        : stableSelector(submitBtn)
      : "";
    const emailType = (emailInput as HTMLInputElement).type || "text";
    return {
      emailSelector: stableSelector(emailInput),
      emailType,
      passwordSelector: stableSelector(passwordInput),
      submitSelector,
      hasSubmitBtn: Boolean(submitBtn),
    };
  });
  if (!result) return null;
  const emailSelector = result.emailSelector || `input[type="${result.emailType}"]`;
  const passwordSelector = result.passwordSelector || 'input[type="password"]';
  const submitSelector = result.submitSelector || (result.hasSubmitBtn ? 'button[type="submit"]' : "");
  if (!emailSelector || !passwordSelector || !submitSelector) return null;
  return { emailSelector, passwordSelector, submitSelector };
}

/** Same-origin links visibles en la página actual, para el rastreo del Modo A (exploración completa). */
export async function extractSameOriginLinks(page: Page, baseUrl: string, limit: number): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href),
  );
  const seen = new Set<string>();
  const result: string[] = [];
  for (const href of hrefs) {
    try {
      const url = new URL(href);
      if (url.origin !== origin) continue;
      url.hash = "";
      const clean = url.toString();
      if (seen.has(clean)) continue;
      seen.add(clean);
      result.push(clean);
      if (result.length >= limit) break;
    } catch {
      // href inválido — se ignora
    }
  }
  return result;
}

const LOGIN_LINK_PATTERN = /iniciar sesi[oó]n|log\s?in|sign\s?in|^entrar$|acceder|ingresar|mi cuenta|my account|acceso/i;
export const NEXT_BUTTON_PATTERN = /^siguiente$|^continuar$|^next$|^continue$|^avanzar$/i;

/**
 * Un locator "text=/regex/" busca coincidencias en TODO el DOM, incluida
 * prosa no interactiva — caso real que ya pasó: para un patrón que incluye
 * "acceder" (parte de LOGIN_LINK_PATTERN), .first() resolvió a
 * `<p>Ingresa tus datos para acceder a tu Oficina Virtual</p>` en vez del
 * botón real "Iniciar Sesión" — el click "funcionaba" (no lanzaba error)
 * pero no hacía nada, porque un párrafo no tiene ningún manejador de
 * click. Este helper acota la búsqueda a controles REALMENTE clickeables
 * (button, a, [role=button], input de tipo submit/button) — la forma
 * correcta en Playwright de decir "el control con este texto", nunca
 * "cualquier nodo con este texto".
 */
export function interactiveTextLocator(page: Page, pattern: RegExp) {
  return page.locator('button, a, [role="button"], input[type="submit"], input[type="button"]').filter({ hasText: pattern });
}

/**
 * Muchos logins reales (Google, Microsoft, Okta y clones) piden el correo
 * en una primera pantalla, y solo después de un "Siguiente" muestran el
 * campo de contraseña — detectLoginForm() nunca los reconoce porque exige
 * ambos campos a la vez. Esta función detecta ESE primer paso: un campo de
 * texto/correo sin contraseña al lado, más un botón de avanzar.
 */
export async function detectEmailOnlyStep(page: Page): Promise<{ emailSelector: string; nextSelector: string } | null> {
  const result = await page.evaluate(
    ({ nextPattern }) => {
      function stableSelector(el: Element): string {
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        if (el.id) return `#${el.id}`;
        const name = el.getAttribute("name");
        if (name) return `[name="${name}"]`;
        return "";
      }
      if (document.querySelector('input[type="password"]')) return null;
      const emailInput =
        document.querySelector('input[type="email"]') ||
        document.querySelector(
          'input[name="email"], input[id="email"], input[autocomplete="username"], input[placeholder*="correo" i], input[placeholder*="email" i], input[placeholder*="usuario" i]',
        ) ||
        Array.from(document.querySelectorAll('input[type="text"]'))[0];
      if (!emailInput) return null;
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
      const nextBtn =
        buttons.find((b) => new RegExp(nextPattern, "i").test((b.textContent || (b as HTMLInputElement).value || "").trim())) ||
        document.querySelector('button[type="submit"]');
      if (!nextBtn) return null;
      const nextSelector =
        (nextBtn.textContent || "").trim().length > 0 ? `text=${(nextBtn.textContent || "").trim()}` : stableSelector(nextBtn);
      const emailType = (emailInput as HTMLInputElement).type || "text";
      return { emailSelector: stableSelector(emailInput), emailType, nextSelector };
    },
    { nextPattern: NEXT_BUTTON_PATTERN.source },
  );
  if (!result) return null;
  const emailSelector = result.emailSelector || `input[type="${result.emailType}"]`;
  if (!emailSelector || !result.nextSelector) return null;
  return { emailSelector, nextSelector: result.nextSelector };
}

export interface AutoLoginResult {
  /** null si no se pudo armar la precondición automática (ver `structure` para seguir de todos modos). */
  steps: QaStep[] | null;
  /** El mapa funcional de la última página alcanzada — se guarda igual aunque no se haya encontrado login, para que la generación de casos tenga algo real con qué trabajar en vez de nada. */
  structure: PageStructure;
}

/**
 * Atajo "solo con la URL + credenciales": visita targetUrl, busca un
 * formulario de login, y si lo encuentra arma los 4 pasos de precondición
 * automáticamente — el usuario no tiene que abrir el editor de pasos para
 * el caso más común (un módulo detrás de un login). `steps` viene en null
 * si no encontró un formulario de login reconocible — pero NUNCA se
 * detiene ahí: sección 5 del módulo exige seguir adelante en vez de
 * bloquear, así que igual devuelve el mapa funcional de donde terminó
 * (que puede mostrar un formulario de login que la heurística no logró
 * emparejar del todo, u otra pantalla) para que la generación de casos
 * pueda razonar sobre eso y, si hace falta, pedir las credenciales como
 * un dato faltante en vez de nunca poder avanzar.
 *
 * targetUrl casi nunca ES la página de login — normalmente es la home o la
 * URL base de la app (lo que un usuario da naturalmente). Si no hay
 * formulario de login ahí mismo, se busca un link/botón de acceso visible
 * ("Iniciar sesión", "Log in"...) y se sigue una vez antes de rendirse.
 */
export async function autoBuildLoginSetupSteps(params: { targetUrl: string; email: string; password: string }): Promise<AutoLoginResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    await page.goto(params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
    await settleAfterNavigation(page);

    let form = await detectLoginForm(page);
    if (!form) {
      // interactiveTextLocator (no un text=/regex/ crudo) — ver su
      // docstring: evita clickear un párrafo de prosa que solo contiene
      // una palabra del patrón, en vez del botón real.
      const loginControl = interactiveTextLocator(page, LOGIN_LINK_PATTERN).first();
      const found = await loginControl.count().catch(() => 0);
      if (found > 0) {
        // En apps con un framework pesado (Angular/React) el botón puede
        // existir en el DOM antes de que su listener real quede conectado
        // — un solo click justo en ese instante no dispara nada y no lanza
        // error. Como networkidle+timeout fijo no garantiza ese momento
        // exacto, se reintenta el click un par de veces esperando a que la
        // URL cambie, en vez de rendirse tras el primer intento silencioso.
        const urlBeforeClick = page.url();
        for (let attempt = 0; attempt < 3 && page.url() === urlBeforeClick; attempt++) {
          await loginControl.click({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
          await settleAfterNavigation(page);
        }
        form = await detectLoginForm(page);
      }
    }

    // Login en dos pasos (correo primero, contraseña después de "Siguiente"):
    // si todavía no hay formulario completo pero SÍ hay un campo de correo
    // solo con un botón de avanzar, se sigue ese paso una vez y se vuelve a
    // buscar la contraseña en la pantalla resultante.
    let emailStep: { emailSelector: string; nextSelector: string } | null = null;
    if (!form) {
      emailStep = await detectEmailOnlyStep(page);
      if (emailStep) {
        await page.locator(emailStep.emailSelector).first().fill(params.email, { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
        const urlBeforeNext = page.url();
        for (let attempt = 0; attempt < 3 && page.url() === urlBeforeNext; attempt++) {
          await page.locator(emailStep.nextSelector).first().click({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
          await settleAfterNavigation(page);
        }
        form = await detectLoginForm(page);
        if (!form) emailStep = null; // el paso 1 no llevó a un login real — no sirve de nada guardarlo
      }
    }

    const structure = await discoverPageStructure(page);

    if (!form) return { steps: null, structure };

    const startUrl = params.targetUrl;
    const steps: QaStep[] = emailStep
      ? [
          { action: "goto", value: startUrl, description: "Ir a la página de acceso" },
          { action: "fill", selector: emailStep.emailSelector, value: params.email, description: "Escribir el correo" },
          { action: "click", selector: emailStep.nextSelector, description: "Continuar" },
          { action: "fill", selector: form.passwordSelector, value: params.password, description: "Escribir la contraseña" },
          { action: "click", selector: form.submitSelector, description: "Enviar el formulario de acceso" },
        ]
      : [
          { action: "goto", value: page.url(), description: "Ir a la página de acceso" },
          { action: "fill", selector: form.emailSelector, value: params.email, description: "Escribir el correo" },
          { action: "fill", selector: form.passwordSelector, value: params.password, description: "Escribir la contraseña" },
          { action: "click", selector: form.submitSelector, description: "Enviar el formulario de acceso" },
        ];

    return { steps, structure };
  } finally {
    await browser.close().catch(() => {});
  }
}

export interface LoginInvestigationResult {
  investigatedAt: string;
  /** Selector real del botón/link que reveló el formulario, o null si el formulario ya estaba a la vista sin necesidad de click. */
  loginClickSelector: string | null;
  /** true si el correo y la contraseña viven en pantallas separadas (Microsoft, Google, Okta y clones) — confirmado en vivo, no inferido. */
  isTwoStep: boolean;
  emailSelector: string;
  /** Selector del botón "Siguiente" — solo si isTwoStep. */
  nextSelector: string | null;
  passwordSelector: string;
  submitSelector: string;
  /** Resultado real de loguearse con las credenciales correctas. */
  happyPath: { finalUrl: string; headings: string[]; textSnippets: string[] } | null;
  /** Resultado real de intentar con la contraseña incorrecta (mismo correo real). */
  wrongPassword: { finalUrl: string; headings: string[]; textSnippets: string[]; stayedOnPasswordScreen: boolean } | null;
  /** Resultado real de enviar el formulario sin completar el correo. */
  emptyEmail: { finalUrl: string; stillOnLoginScreen: boolean } | null;
}

/**
 * Investigación real del flujo de login con credenciales reales — el
 * equivalente a que un QA humano se siente a probar el login él mismo
 * ANTES de escribir casos, en vez de que el generador de casos adivine
 * selectores y textos y los marque "inferido, no confirmado en el mapa".
 * Se dispara una sola vez por módulo, apenas el cliente responde las
 * preguntas de correo/contraseña (ver qa.service.ts) — recorre en vivo el
 * login exitoso, la contraseña incorrecta y el correo vacío, y devuelve
 * selectores y textos 100% observados. Es la causa de fondo de varios
 * bugs reales que ya pasaron en producción: un login en dos pasos que el
 * generador no reconoció, un botón "Siguiente" que no era
 * button[type=submit], y un mensaje de error que se esperaba en español
 * cuando la pantalla real lo muestra en inglés — los tres eran
 * suposiciones que esta investigación reemplaza por hechos.
 *
 * Devuelve null si no logra reconocer ningún formulario de login real —
 * en ese caso el sistema sigue dependiendo de la inferencia, exactamente
 * como antes de tener esta función.
 */
export async function investigateLoginFlow(params: {
  targetUrl: string;
  email: string;
  password: string;
}): Promise<LoginInvestigationResult | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    /** Llega hasta la pantalla de login desde targetUrl, dando click en el link de acceso si hace falta. Devuelve el selector usado para el click, o null si el form ya estaba a la vista. */
    async function reachLoginScreen(page: Page): Promise<string | null> {
      await page.goto(params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
      await settleAfterNavigation(page);
      if (await detectLoginForm(page)) return null;
      if (await detectEmailOnlyStep(page)) return null;
      const loginControl = interactiveTextLocator(page, LOGIN_LINK_PATTERN).first();
      const found = await loginControl.count().catch(() => 0);
      if (found === 0) return null;
      // Selector final = el texto EXACTO y literal del control real que se
      // encontró (no el patrón amplio que lo buscó) — un texto literal es
      // mucho más específico que el patrón OR usado para llegar hasta acá,
      // y es la misma forma ("text=Iniciar Sesión") que ya se probó
      // confiable en las corridas reales de casos de este módulo.
      const controlText = (await loginControl.textContent().catch(() => null))?.trim();
      const selectorUsed = controlText ? `text=${controlText}` : `text=/${LOGIN_LINK_PATTERN.source}/i`;
      const urlBeforeClick = page.url();
      for (let attempt = 0; attempt < 3 && page.url() === urlBeforeClick; attempt++) {
        await loginControl.click({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
        await settleAfterNavigation(page);
      }
      return selectorUsed;
    }

    // --- Pasada 1: camino feliz, credenciales correctas — establece los selectores confirmados que las pasadas 2 y 3 reutilizan ---
    const page1 = await context.newPage();
    page1.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    const loginClickSelector = await reachLoginScreen(page1);

    let form = await detectLoginForm(page1);
    let emailStep: { emailSelector: string; nextSelector: string } | null = null;
    if (!form) {
      emailStep = await detectEmailOnlyStep(page1);
      if (!emailStep) {
        await page1.close();
        return null;
      }
      await page1
        .locator(emailStep.emailSelector)
        .first()
        .fill(params.email, { timeout: DEFAULT_TIMEOUT_MS })
        .catch(() => {});
      const urlBeforeNext = page1.url();
      for (let attempt = 0; attempt < 3 && page1.url() === urlBeforeNext; attempt++) {
        await page1
          .locator(emailStep.nextSelector)
          .first()
          .click({ timeout: DEFAULT_TIMEOUT_MS })
          .catch(() => {});
        await settleAfterNavigation(page1);
      }
      form = await detectLoginForm(page1);
      if (!form) {
        await page1.close();
        return null;
      }
    }
    await page1
      .locator(form.passwordSelector)
      .first()
      .fill(params.password, { timeout: DEFAULT_TIMEOUT_MS })
      .catch(() => {});
    await page1
      .locator(form.submitSelector)
      .first()
      .click({ timeout: DEFAULT_TIMEOUT_MS })
      .catch(() => {});
    await settleAfterNavigation(page1);
    const happyStructure = await discoverPageStructure(page1);
    const happyPath = { finalUrl: page1.url(), headings: happyStructure.headings, textSnippets: happyStructure.textSnippets };
    await page1.close();

    const isTwoStep = Boolean(emailStep);
    const emailSelector = emailStep?.emailSelector ?? form.emailSelector;
    const nextSelector = emailStep?.nextSelector ?? null;
    const passwordSelector = form.passwordSelector;
    const submitSelector = form.submitSelector;

    // --- Pasada 2: contraseña incorrecta, mismo correo real — usa los selectores ya confirmados en la pasada 1 ---
    let wrongPassword: LoginInvestigationResult["wrongPassword"] = null;
    try {
      const page2 = await context.newPage();
      page2.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
      await reachLoginScreen(page2);
      await page2.locator(emailSelector).first().fill(params.email, { timeout: DEFAULT_TIMEOUT_MS });
      if (nextSelector) {
        await page2
          .locator(nextSelector)
          .first()
          .click({ timeout: DEFAULT_TIMEOUT_MS })
          .catch(() => {});
        await settleAfterNavigation(page2);
      }
      const stillHasPasswordField = (await page2.locator(passwordSelector).first().count().catch(() => 0)) > 0;
      if (stillHasPasswordField) {
        await page2.locator(passwordSelector).first().fill(`${params.password}_qa_invalida`, { timeout: DEFAULT_TIMEOUT_MS });
        await page2
          .locator(submitSelector)
          .first()
          .click({ timeout: DEFAULT_TIMEOUT_MS })
          .catch(() => {});
        await settleAfterNavigation(page2);
      }
      const wrongStructure = await discoverPageStructure(page2);
      wrongPassword = {
        finalUrl: page2.url(),
        headings: wrongStructure.headings,
        textSnippets: wrongStructure.textSnippets,
        stayedOnPasswordScreen: await page2
          .locator(passwordSelector)
          .first()
          .isVisible()
          .catch(() => false),
      };
      await page2.close();
    } catch {
      wrongPassword = null;
    }

    // --- Pasada 3: correo vacío ---
    let emptyEmail: LoginInvestigationResult["emptyEmail"] = null;
    try {
      const page3 = await context.newPage();
      page3.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
      await reachLoginScreen(page3);
      const submitOnFirstScreen = nextSelector ?? submitSelector;
      await page3
        .locator(submitOnFirstScreen)
        .first()
        .click({ timeout: DEFAULT_TIMEOUT_MS })
        .catch(() => {});
      await settleAfterNavigation(page3);
      const stillOnLoginScreen = await page3
        .locator(emailSelector)
        .first()
        .isVisible()
        .catch(() => false);
      emptyEmail = { finalUrl: page3.url(), stillOnLoginScreen };
      await page3.close();
    } catch {
      emptyEmail = null;
    }

    return {
      investigatedAt: new Date().toISOString(),
      loginClickSelector,
      isTwoStep,
      emailSelector,
      nextSelector,
      passwordSelector,
      submitSelector,
      happyPath,
      wrongPassword,
      emptyEmail,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const SPANISH_STOPWORDS = new Set([
  "para",
  "debe",
  "esta",
  "este",
  "esto",
  "sobre",
  "como",
  "cada",
  "desde",
  "hasta",
  "cuando",
  "donde",
  "pero",
  "que",
  "los",
  "las",
  "una",
  "uno",
  "con",
  "sin",
  "por",
  "del",
  "modulo",
  "módulo",
  "pagina",
  "página",
  "verifica",
  "verificar",
  "validar",
  "prueba",
  "pruebas",
  "test",
  "aplicacion",
  "aplicación",
]);

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

/** Palabras significativas (>=4 letras, sin muletillas) de la descripción del módulo — para buscar de verdad la pantalla que el cliente pidió probar, en vez de quedarse en la primera que aparezca. */
function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      normalizeText(text)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !SPANISH_STOPWORDS.has(w)),
    ),
  );
}

function scoreAgainstKeywords(candidateText: string, keywords: string[]): number {
  const normalized = normalizeText(candidateText);
  return keywords.filter((k) => normalized.includes(k)).length;
}

const MAX_RELEVANCE_HOPS = 2;

/**
 * Ejecuta la precondición del módulo (si tiene) y captura el mapa
 * funcional de la página resultante. En Modo A (exploración completa)
 * también recorre un puñado de páginas más alcanzables desde ahí, sin
 * filtrar por relevancia (rastreo amplio deliberado). En Modo B (puntual,
 * el recomendado) el usuario describió una funcionalidad concreta — si esa
 * funcionalidad no vive en la página donde termina la precondición (lo más
 * común: login deja al navegador en el dashboard, no en "Facturación"),
 * quedarse ahí produce casos que no corresponden a nada real. Por eso acá
 * también se sigue, hasta dos saltos, el link o botón visible cuyo texto
 * mejor coincide con las palabras clave de la descripción — así el
 * generador de casos ve la pantalla real, no solo la de entrada.
 */
export async function runDiscovery(params: {
  targetUrl: string;
  setupSteps: QaStep[];
  scopeMode: "scoped" | "full";
  crawlLimit?: number;
  /** Nombre + descripción del módulo — guía qué página real buscar en Modo B. */
  relevanceText?: string;
}): Promise<{ pages: PageStructure[] }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    if (params.setupSteps.length === 0) {
      await page.goto(params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
      await settleAfterNavigation(page);
    } else {
      for (const step of params.setupSteps) {
        if (step.action === "goto") await page.goto(step.value || params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
        else if (step.action === "click" && step.selector) await page.locator(step.selector).first().click({ timeout: DEFAULT_TIMEOUT_MS });
        else if (step.action === "fill" && step.selector) await page.locator(step.selector).first().fill(step.value ?? "", { timeout: DEFAULT_TIMEOUT_MS });
      }
      await settleAfterNavigation(page);
    }

    const pages: PageStructure[] = [await discoverPageStructure(page)];

    if (params.scopeMode === "full") {
      const links = await extractSameOriginLinks(page, params.targetUrl, params.crawlLimit ?? 8);
      for (const link of links) {
        try {
          await page.goto(link, { timeout: DEFAULT_TIMEOUT_MS });
          await settleAfterNavigation(page);
          pages.push(await discoverPageStructure(page));
        } catch {
          // una página que no carga no debe tumbar todo el descubrimiento
        }
      }
    } else if (params.relevanceText) {
      const keywords = extractKeywords(params.relevanceText);
      if (keywords.length > 0) {
        const visitedUrls = new Set([page.url()]);
        for (let hop = 0; hop < MAX_RELEVANCE_HOPS; hop++) {
          const current = pages[pages.length - 1]!;
          const candidates = [
            ...current.links.map((l) => ({ text: l.text, selector: l.selector, kind: "link" as const })),
            ...current.buttons.map((b) => ({ text: b.text, selector: b.selector, kind: "button" as const })),
          ]
            .map((c) => ({ ...c, score: scoreAgainstKeywords(c.text, keywords) }))
            .filter((c) => c.score > 0)
            .sort((a, b) => b.score - a.score);
          const best = candidates[0];
          if (!best) break;

          try {
            if (best.kind === "link") {
              const url = new URL(best.selector, page.url()).toString();
              if (visitedUrls.has(url)) break;
              await page.goto(url, { timeout: DEFAULT_TIMEOUT_MS });
            } else {
              const urlBefore = page.url();
              await page.locator(best.selector).first().click({ timeout: DEFAULT_TIMEOUT_MS });
              await settleAfterNavigation(page);
              if (page.url() === urlBefore) {
                // No cambió la URL — puede haber abierto un modal o expandido
                // contenido en la misma página. Igual vale la pena
                // recapturar la estructura una vez, pero no seguir saltando
                // desde acá (no hay una URL nueva que marcar como visitada).
                pages.push(await discoverPageStructure(page));
                break;
              }
            }
            await settleAfterNavigation(page);
            const url = page.url();
            if (visitedUrls.has(url)) break;
            visitedUrls.add(url);
            pages.push(await discoverPageStructure(page));
          } catch {
            break; // el salto de relevancia es best-effort — nunca tumba el descubrimiento
          }
        }
      }
    }

    return { pages };
  } finally {
    await browser.close().catch(() => {});
  }
}
