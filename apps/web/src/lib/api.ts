import "server-only";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, API_URL } from "./config";

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

/**
 * Como apiFetch, pero si el access token ya expiró (401) lo renueva con el
 * refresh token guardado y reintenta la petición una vez — solo funciona
 * desde un Route Handler (los Server Components de página no pueden
 * escribir cookies, por eso apiFetch no hace esto solo). Sin esto, una
 * acción que tarda más que JWT_ACCESS_TTL (15 min) — generar casos con IA,
 * correr una prueba real con Playwright — termina en un 401 a mitad de
 * camino aunque la sesión siga siendo válida (el refresh token dura 7
 * días). Úsalo en vez de apiFetch en cualquier proxy /api/... cuya acción
 * pueda tardar o cuya sesión pueda llevar rato abierta.
 */
export async function apiFetchWithRefresh(path: string, init?: RequestInit): Promise<Response> {
  const res = await apiFetch(path, init);
  if (res.status !== 401) return res;

  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return res;

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!refreshRes.ok) return res;

  const { accessToken, refreshToken: newRefreshToken } = (await refreshRes.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const { setSessionCookies } = await import("@/app/api/auth/_set-session");
  await setSessionCookies(accessToken, newRefreshToken);

  return apiFetch(path, init);
}

/** NestJS sends an empty body (not `null`) for a controller that returns null — plain `.json()` throws on that. */
export async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}
