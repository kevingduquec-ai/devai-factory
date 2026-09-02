import { z } from "zod";
import { ClaudeClient } from "../claude-client";

export const IntakeSummarySchema = z.object({
  domain: z
    .string()
    .describe(
      "Una sola palabra en minúscula que mejor describe el dominio de negocio (ej: salud, finanzas, retail, logistica, educacion). Usa 'default' si no aplica ninguno específico.",
    ),
  userTypes: z.array(z.string()).describe("Tipos de usuario mencionados o implícitos (ej: 'administrador', 'cliente')."),
  integrationsMentioned: z.array(z.string()).describe("Integraciones externas mencionadas (ej: 'WhatsApp', 'pasarela de pagos'). Vacío si ninguna."),
  summary: z.string().describe("Resumen de 2-3 frases de la necesidad descrita, en español neutro."),
});

export type IntakeSummary = z.infer<typeof IntakeSummarySchema>;

const SYSTEM_PROMPT = `Eres un analista de requerimientos senior. Tu única tarea en esta
etapa es leer la descripción libre de una necesidad de software y producir un
resumen estructurado. No inventes requerimientos todavía, no hagas preguntas:
solo extrae y clasifica lo que el usuario ya dijo.`;

export async function runIntakeStage(claude: ClaudeClient, description: string) {
  return claude.generateStructured({
    system: SYSTEM_PROMPT,
    prompt: `Descripción del cliente:\n"""${description}"""`,
    schema: IntakeSummarySchema,
    schemaName: "intake_summary",
  });
}
