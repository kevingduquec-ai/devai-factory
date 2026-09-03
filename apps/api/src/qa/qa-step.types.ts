/**
 * Un paso ejecutable, usado tanto en el guion de acceso de un módulo
 * (QaTestModule.setupSteps, Fase 0) como en los pasos de un caso de prueba
 * (QaTestCase.steps, Fase 2). Mismo formato en ambos lugares a propósito:
 * el runner (playwright-runner.ts) no distingue entre "paso de setup" y
 * "paso del caso" — simplemente ejecuta una lista de QaStep en orden.
 */
export interface QaStep {
  action: "goto" | "click" | "fill" | "select" | "wait_for_text" | "assert_text" | "assert_url" | "assert_element_visible";
  /** Selector CSS o de texto de Playwright (ej: "text=Iniciar sesión", "#email"). Requerido salvo en goto/wait_for_text/assert_url. */
  selector?: string | null;
  /** Texto a escribir, URL a visitar, opción a elegir, o texto esperado — según la acción. */
  value?: string | null;
  /**
   * Si el valor real todavía no se conoce (sección 5 del módulo), este
   * campo trae la clave de una QaMissingDataRequest — el runner sustituye
   * `value` por el dato ya resuelto (desencriptado si es secreto) justo
   * antes de ejecutar el paso, nunca antes.
   */
  dataRef?: string | null;
  /** Descripción breve en español de qué hace el paso, para mostrar en el reporte. */
  description: string;
}

export function isQaStepArray(value: unknown): value is QaStep[] {
  return Array.isArray(value);
}
