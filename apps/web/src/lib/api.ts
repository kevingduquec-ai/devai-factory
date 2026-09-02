import "server-only";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, API_URL } from "./config";

/** Server-only fetch to the NestJS API, forwarding the caller's session cookie as a Bearer token. */
export async function apiFetch(path: string, init?: RequestInit) {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

/** NestJS sends an empty body (not `null`) for a controller that returns null — plain `.json()` throws on that. */
export async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}
