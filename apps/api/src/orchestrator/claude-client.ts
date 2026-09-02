import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export interface StructuredCallResult<T> {
  data: T;
  tokensIn: number;
  tokensOut: number;
}

@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow<string>("ANTHROPIC_API_KEY") });
    this.model = config.get<string>("ANTHROPIC_MODEL", "claude-sonnet-5");
  }

  /**
   * Runs one orchestrator stage: a Claude call constrained to return JSON
   * matching `schema`. Each stage in the pipeline gets its own schema and
   * system prompt (spec section 5) — never free text parsed by hand.
   *
   * If the first attempt doesn't validate against the schema — including a
   * response truncated by `max_tokens`, which the SDK surfaces as a thrown
   * parse error rather than a null `parsed_output` — retries once with a
   * correction instruction appended to the system prompt. Per spec: "si
   * Claude devuelve algo incompleto, se reintenta esa etapa con una
   * instrucción de corrección, no se reinicia el pipeline completo".
   */
  async generateStructured<T>(params: {
    system: string;
    prompt: string;
    schema: ZodType<T>;
    schemaName: string;
    /** Stages that produce lists of stories/entities/test cases need real headroom — default errs high. */
    maxTokens?: number;
  }): Promise<StructuredCallResult<T>> {
    const maxTokens = params.maxTokens ?? 16000;
    const call = (system: string) =>
      this.client.messages
        .stream({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: params.prompt }],
          output_config: { format: zodOutputFormat(params.schema) },
        })
        .finalMessage();

    const correctionSystem = `${params.system}\n\nIMPORTANTE: tu respuesta anterior no cumplió exactamente el esquema JSON solicitado (pudo haber quedado incompleta o mal formada). Revisa cada campo requerido y devuelve un JSON completo y válido que cumpla el esquema.`;

    let tokensIn = 0;
    let tokensOut = 0;
    let lastError: unknown;

    for (const [attempt, system] of [params.system, correctionSystem].entries()) {
      try {
        const response = await call(system);
        tokensIn += response.usage.input_tokens;
        tokensOut += response.usage.output_tokens;
        if (response.parsed_output) {
          return { data: response.parsed_output, tokensIn, tokensOut };
        }
        this.logger.warn(`Etapa "${params.schemaName}": intento ${attempt + 1} sin salida estructurada válida`);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Etapa "${params.schemaName}": intento ${attempt + 1} falló (${error instanceof Error ? error.message : error})`,
        );
      }
    }

    throw new InternalServerErrorException(
      `La etapa "${params.schemaName}" del orquestador no devolvió una respuesta válida tras reintentar` +
        (lastError instanceof Error ? `: ${lastError.message}` : ""),
    );
  }
}
