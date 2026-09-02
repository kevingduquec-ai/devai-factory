import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OrganizationDto, OrgUserDto } from "@devai-factory/shared-types";
import { ACCESS_TOKEN_COOKIE, API_URL } from "./config";

/** Server-only helper: fetches the current org (and implicitly validates the session). */
export async function requireSession() {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  const [orgRes, usersRes] = await Promise.all([
    fetch(`${API_URL}/orgs/me`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }),
    fetch(`${API_URL}/orgs/users`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }),
  ]);

  if (!orgRes.ok || !usersRes.ok) {
    return null;
  }

  const organization: OrganizationDto = await orgRes.json();
  const users: OrgUserDto[] = await usersRes.json();
  const claims = decodeJwtClaims(accessToken);
  return { organization, users, accessToken, currentUserId: claims?.sub, currentUserRole: claims?.role };
}

/**
 * Para toda página del dashboard EXCEPTO /dashboard/billing: exige sesión
 * y, además, que la organización tenga una suscripción activa — si no la
 * tiene (toda organización nueva empieza así, hasta que Stripe confirme un
 * pago o el super-admin la active a mano), redirige a Facturación en vez de
 * dejar pasar. Así ningún dato ni acción del producto queda accesible sin
 * pasar primero por esa pantalla.
 */
export async function requireActiveSubscription() {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.organization.subscriptionActive) {
    redirect("/dashboard/billing");
  }
  return session;
}

/**
 * Lee (sin verificar la firma) los claims del JWT solo para decidir qué
 * mostrar en la UI — ej. ocultar el botón de invitar a quien no es owner.
 * La autorización real siempre la aplica el backend (RolesGuard), esto es
 * puramente cosmético.
 */
function decodeJwtClaims(token: string): { sub?: string; role?: string } | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
