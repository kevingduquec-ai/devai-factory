import "server-only";
import { cookies } from "next/headers";
import { ADMIN_ACCESS_TOKEN_COOKIE, API_URL } from "./config";

/** Server-only fetch to the NestJS admin API, forwarding the super-admin session cookie. */
export async function adminApiFetch(path: string, init?: RequestInit) {
  const store = await cookies();
  const accessToken = store.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value;

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

export async function requireAdminToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value ?? null;
}
