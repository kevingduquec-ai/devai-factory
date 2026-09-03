import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import type { QaStep } from "./qa-step.types";

export interface StepExecutionResult {
  description: string;
  ok: boolean;
  errorMessage?: string;
  screenshotFile: string;
}

export interface CaseExecutionResult {
  status: "passed" | "failed" | "error";
  errorMessage?: string;
  screenshots: string[];
}

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Reintenta `check` cada 300ms hasta que devuelva true o se agote el
 * tiempo — necesario porque un click puede disparar una navegación del
 * lado del cliente (router.push + refresh, típico en Next.js) que no
 * termina en el mismo tick en que Playwright considera el click
 * "completado". Sin este reintento, un assert justo después de un click
 * revisa la página vieja y falla por una carrera, no por un bug real.
 */
async function pollUntil(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return check();
}

function resolveValue(step: QaStep, resolvedData: Map<string, string>): string | undefined {
  if (step.dataRef) {
    const resolved = resolvedData.get(step.dataRef);
    if (resolved === undefined) {
      throw new Error(`Falta el dato "${step.dataRef}" — el caso no debería haberse ejecutado sin resolverlo primero`);
    }
    return resolved;
  }
  return step.value ?? undefined;
}

/** Ejecuta un paso sobre la página real — este es el único lugar del sistema que traduce un QaStep a una llamada real de Playwright. */
async function runStep(page: Page, step: QaStep, resolvedData: Map<string, string>, defaultUrl: string): Promise<void> {
  const value = resolveValue(step, resolvedData);
  switch (step.action) {
    case "goto":
      await page.goto(value || defaultUrl, { timeout: DEFAULT_TIMEOUT_MS });
      return;
    case "click":
      if (!step.selector) throw new Error("El paso de tipo click no trae selector");
      await page.locator(step.selector).first().click({ timeout: DEFAULT_TIMEOUT_MS });
      // Best-effort: si el clic disparó una navegación (ej. login), le da
      // tiempo a la app a asentarse antes del siguiente paso — nunca
      // revienta el caso si no hay navegación (timeout corto y silencioso).
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      return;
    case "fill":
      if (!step.selector) throw new Error("El paso de tipo fill no trae selector");
      await page.locator(step.selector).first().fill(value ?? "", { timeout: DEFAULT_TIMEOUT_MS });
      return;
    case "select":
      if (!step.selector) throw new Error("El paso de tipo select no trae selector");
      await page.locator(step.selector).first().selectOption(value ?? "", { timeout: DEFAULT_TIMEOUT_MS });
      return;
    case "wait_for_text":
      if (!value) throw new Error("El paso de tipo wait_for_text no trae el texto a esperar");
      await page.getByText(value).first().waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      return;
    case "assert_text": {
      if (!value) throw new Error("El paso de tipo assert_text no trae el texto esperado");
      const found = await pollUntil(async () => (await page.getByText(value).count()) > 0, DEFAULT_TIMEOUT_MS);
      if (!found) throw new Error(`No se encontró el texto esperado: "${value}"`);
      return;
    }
    case "assert_url": {
      if (!value) throw new Error("El paso de tipo assert_url no trae el fragmento de URL esperado");
      const matched = await pollUntil(async () => page.url().includes(value), DEFAULT_TIMEOUT_MS);
      if (!matched) {
        throw new Error(`La URL actual (${page.url()}) no contiene "${value}"`);
      }
      return;
    }
    case "assert_element_visible": {
      if (!step.selector) throw new Error("El paso de tipo assert_element_visible no trae selector");
      const selector = step.selector;
      const visible = await pollUntil(
        () => page.locator(selector).first().isVisible().catch(() => false),
        DEFAULT_TIMEOUT_MS,
      );
      if (!visible) throw new Error(`El elemento "${step.selector}" no está visible`);
      return;
    }
  }
}

/**
 * Ejecuta la precondición del módulo (Fase 0) seguida de los pasos de un
 * caso puntual (Fase 3), en la misma página — así el caso arranca
 * exactamente donde la precondición lo dejó, sin volver a explorar nada
 * fuera de su alcance. Captura una evidencia (screenshot) después de CADA
 * paso, tanto de setup como del caso, y se detiene en el primer error.
 */
export async function executeQaCase(params: {
  targetUrl: string;
  setupSteps: QaStep[];
  caseSteps: QaStep[];
  resolvedData: Map<string, string>;
  evidenceDir: string;
}): Promise<CaseExecutionResult> {
  await mkdir(params.evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const screenshots: string[] = [];
  let stepIndex = 0;

  const captureScreenshot = async (page: Page) => {
    stepIndex += 1;
    const filename = `${String(stepIndex).padStart(3, "0")}.png`;
    await page.screenshot({ path: join(params.evidenceDir, filename) }).catch(() => {});
    screenshots.push(filename);
  };

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    const allSteps = [...params.setupSteps, ...params.caseSteps];
    for (const step of allSteps) {
      try {
        await runStep(page, step, params.resolvedData, params.targetUrl);
        await captureScreenshot(page);
      } catch (error) {
        await captureScreenshot(page);
        return {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Error desconocido durante la ejecución",
          screenshots,
        };
      }
    }

    return { status: "passed", screenshots };
  } catch (error) {
    return {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Error desconocido preparando el navegador",
      screenshots,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
