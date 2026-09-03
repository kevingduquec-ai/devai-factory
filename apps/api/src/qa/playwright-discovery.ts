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
}

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ELEMENTS = 25;

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

    return { url: window.location.href, title: document.title, headings, buttons, links, inputs };
  }, MAX_ELEMENTS);
}

/** Busca en la página actual un formulario de login (campo de correo/usuario + contraseña + botón de envío). */
export async function detectLoginForm(page: Page): Promise<{ emailSelector: string; passwordSelector: string; submitSelector: string } | null> {
  return page.evaluate(() => {
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
      document.querySelector('input[name="email"], input[id="email"], input[autocomplete="username"]') ||
      Array.from(document.querySelectorAll('input[type="text"]'))[0];
    if (!emailInput) return null;
    const form = passwordInput.closest("form");
    const submitBtn = form?.querySelector('button[type="submit"], button:not([type])') || document.querySelector('button[type="submit"]');
    const submitSelector = submitBtn
      ? (submitBtn.textContent || "").trim().length > 0
        ? `text=${(submitBtn.textContent || "").trim()}`
        : stableSelector(submitBtn)
      : "";
    const emailSelector = stableSelector(emailInput);
    const passwordSelector = stableSelector(passwordInput);
    if (!emailSelector || !passwordSelector || !submitSelector) return null;
    return { emailSelector, passwordSelector, submitSelector };
  });
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

const LOGIN_LINK_PATTERN = /iniciar sesi[oó]n|log\s?in|sign\s?in|^entrar$|acceder/i;

/**
 * Atajo "solo con la URL + credenciales": visita targetUrl, busca un
 * formulario de login, y si lo encuentra arma los 4 pasos de precondición
 * automáticamente — el usuario no tiene que abrir el editor de pasos para
 * el caso más común (un módulo detrás de un login). Devuelve null si no
 * encontró un formulario de login reconocible en esa página.
 *
 * targetUrl casi nunca ES la página de login — normalmente es la home o la
 * URL base de la app (lo que un usuario da naturalmente). Si no hay
 * formulario de login ahí mismo, se busca un link/botón de acceso visible
 * ("Iniciar sesión", "Log in"...) y se sigue una vez antes de rendirse.
 */
export async function autoBuildLoginSetupSteps(params: { targetUrl: string; email: string; password: string }): Promise<QaStep[] | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    await page.goto(params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });

    let form = await detectLoginForm(page);
    if (!form) {
      const loginControl = page.getByText(LOGIN_LINK_PATTERN).first();
      const found = await loginControl.count();
      if (found > 0) {
        await loginControl.click({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
        form = await detectLoginForm(page);
      }
    }
    if (!form) return null;

    const loginPageUrl = page.url();
    return [
      { action: "goto", value: loginPageUrl, description: "Ir a la página de acceso" },
      { action: "fill", selector: form.emailSelector, value: params.email, description: "Escribir el correo" },
      { action: "fill", selector: form.passwordSelector, value: params.password, description: "Escribir la contraseña" },
      { action: "click", selector: form.submitSelector, description: "Enviar el formulario de acceso" },
    ];
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Ejecuta la precondición del módulo (si tiene) y captura el mapa
 * funcional de la página resultante — y, en Modo A, de un puñado de
 * páginas más alcanzables desde ahí (rastreo superficial, un solo nivel,
 * para mantener el costo bajo). Esta es la Fase 1 completa: en Modo B
 * produce el mapa de un módulo puntual; en Modo A, un mapa de varias
 * pantallas de la app.
 */
export async function runDiscovery(params: {
  targetUrl: string;
  setupSteps: QaStep[];
  scopeMode: "scoped" | "full";
  crawlLimit?: number;
}): Promise<{ pages: PageStructure[] }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    if (params.setupSteps.length === 0) {
      await page.goto(params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
    } else {
      for (const step of params.setupSteps) {
        if (step.action === "goto") await page.goto(step.value || params.targetUrl, { timeout: DEFAULT_TIMEOUT_MS });
        else if (step.action === "click" && step.selector) await page.locator(step.selector).first().click({ timeout: DEFAULT_TIMEOUT_MS });
        else if (step.action === "fill" && step.selector) await page.locator(step.selector).first().fill(step.value ?? "", { timeout: DEFAULT_TIMEOUT_MS });
      }
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    }

    const pages: PageStructure[] = [await discoverPageStructure(page)];

    if (params.scopeMode === "full") {
      const links = await extractSameOriginLinks(page, params.targetUrl, params.crawlLimit ?? 8);
      for (const link of links) {
        try {
          await page.goto(link, { timeout: DEFAULT_TIMEOUT_MS });
          pages.push(await discoverPageStructure(page));
        } catch {
          // una página que no carga no debe tumbar todo el descubrimiento
        }
      }
    }

    return { pages };
  } finally {
    await browser.close().catch(() => {});
  }
}
