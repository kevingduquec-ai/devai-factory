/**
 * NestJS's ValidationPipe returns `message` as a string[] whenever more than
 * one field fails validation at once — passing that straight to `new
 * Error(data.message)` lets JS coerce the array to a string, which joins
 * entries with a bare comma and no space ("Ingresa un nombre,Describe la
 * necesidad..."), unreadable. This normalizes both shapes into one sentence.
 */
export function extractErrorMessage(data: unknown, fallback: string): string {
  const message = (data as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) {
    return message.length > 0 ? message.join(". ") : fallback;
  }
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }
  return fallback;
}
