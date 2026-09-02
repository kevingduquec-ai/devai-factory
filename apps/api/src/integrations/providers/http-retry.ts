import { ProviderAuthError, ProviderRequestError } from "./provider.types";

/**
 * fetch con reintentos: 429 respeta Retry-After (o 2s por defecto) hasta 3
 * intentos; 5xx reintenta 2 veces con backoff corto. Ambas APIs (Jira Cloud,
 * ClickUp) limitan solicitudes por minuto y ambas devuelven 429 con
 * Retry-After cuando se excede — sin esto, un estudio completo (60+
 * llamadas) fallaría a mitad de camino en cuentas con límites bajos.
 */
export async function httpJson(
  url: string,
  init: RequestInit,
  { maxRateLimitRetries = 3, maxServerErrorRetries = 2 }: { maxRateLimitRetries?: number; maxServerErrorRetries?: number } = {},
): Promise<{ status: number; body: unknown }> {
  let rateLimitAttempts = 0;
  let serverErrorAttempts = 0;

  while (true) {
    const res = await fetch(url, init);

    if (res.status === 429 && rateLimitAttempts < maxRateLimitRetries) {
      rateLimitAttempts += 1;
      const retryAfterHeader = res.headers.get("Retry-After");
      const waitSeconds = retryAfterHeader ? Number(retryAfterHeader) : 2;
      await sleep((Number.isFinite(waitSeconds) ? waitSeconds : 2) * 1000);
      continue;
    }

    if (res.status >= 500 && serverErrorAttempts < maxServerErrorRetries) {
      serverErrorAttempts += 1;
      await sleep(1000 * serverErrorAttempts);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      const text = await safeText(res);
      throw new ProviderAuthError(`Autenticación rechazada (${res.status}): ${text || "credenciales inválidas o revocadas"}`);
    }

    const text = await safeText(res);
    const body = text ? safeParseJson(text) : null;

    if (!res.ok) {
      throw new ProviderRequestError(summarizeError(res.status, body, text), res.status);
    }

    return { status: res.status, body };
  }
}

function summarizeError(status: number, body: unknown, rawText: string): string {
  if (body && typeof body === "object") {
    const asRecord = body as Record<string, unknown>;
    const messages = asRecord.errorMessages;
    if (Array.isArray(messages) && messages.length > 0) return `${status}: ${messages.join("; ")}`;
    const errors = asRecord.errors;
    if (errors && typeof errors === "object") return `${status}: ${JSON.stringify(errors)}`;
    if (typeof asRecord.err === "string") return `${status}: ${asRecord.err}`;
  }
  return `${status}: ${rawText.slice(0, 500) || "sin detalle"}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
