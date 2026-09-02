/**
 * Domain-specific guidance injected into the orchestrator's system prompts
 * (spec section 5: "el prompt de sistema de cada etapa incluye la plantilla
 * del dominio detectado"). Keyed by the lowercase `domain` the intake stage
 * assigns to a project; `default` covers anything not listed here.
 */
export const DOMAIN_GUIDANCE: Record<string, string> = {
  salud: `Dominio: salud. Ten en cuenta consideraciones de historia clínica
(confidencialidad, consentimiento informado, trazabilidad de quién accede a
qué registro) y cumplimiento normativo de datos sensibles de pacientes.
Incluye siempre al menos un requerimiento no funcional sobre protección de
datos de salud.`,

  finanzas: `Dominio: finanzas. Ten en cuenta cálculo correcto de intereses,
manejo preciso de montos (evita errores de redondeo), trazabilidad completa
de cada transacción y auditoría de cambios sobre saldos o movimientos.
Incluye siempre al menos un requerimiento no funcional sobre integridad y
trazabilidad de transacciones.`,

  retail: `Dominio: retail/comercio. Ten en cuenta gestión de inventario,
variantes de producto, múltiples canales de venta y consistencia de stock
entre canales.`,

  logistica: `Dominio: logística. Ten en cuenta trazabilidad de envíos en
tránsito, estados de una entrega, y notificaciones a los involucrados
(remitente, transportista, destinatario) en cada cambio de estado.`,

  default: `No se detectó un dominio con guías específicas. Aplica buenas
prácticas generales de análisis de requerimientos: separa claramente
requerimientos funcionales de no funcionales, y no asumas integraciones o
reglas de negocio que el usuario no mencionó explícitamente.`,
};

export function getDomainGuidance(domain: string | null | undefined): string {
  if (!domain) return DOMAIN_GUIDANCE.default;
  return DOMAIN_GUIDANCE[domain.toLowerCase()] ?? DOMAIN_GUIDANCE.default;
}

export const KNOWN_DOMAINS = Object.keys(DOMAIN_GUIDANCE).filter((d) => d !== "default");
