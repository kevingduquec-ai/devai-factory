import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, API_URL, REFRESH_TOKEN_COOKIE } from "@/lib/config";

const REFRESH_MARGIN_SECONDS = 60;

function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { exp?: number };
    return claims.exp ?? null;
  } catch {
    return null;
  }
}

function setSessionCookies(res: NextResponse, accessToken: string, refreshToken: string) {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, { ...common, maxAge: 60 * 15 });
  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, { ...common, maxAge: 60 * 60 * 24 * 7 });
}

function redirectToLogin(req: NextRequest) {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * El access token dura 15 minutos — cualquier navegación entre páginas del
 * dashboard que cayera después de ese lapso llegaba aquí sin cookie (el
 * navegador ya la había expirado) y terminaba en /login sin aviso, aunque
 * el refresh token (7 días) siguiera vigente. El middleware sí puede
 * escribir cookies en la respuesta —a diferencia de los Server Components
 * que renderizan el resto de la página—, así que refresca proactivamente
 * ANTES de dejar pasar la petición: el usuario nunca ve la sesión caerse
 * mientras el refresh token siga vigente.
 */
export async function middleware(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  const exp = accessToken ? decodeExpiry(accessToken) : null;
  const needsRefresh = !accessToken || exp === null || exp - Date.now() / 1000 < REFRESH_MARGIN_SECONDS;

  if (!needsRefresh) {
    return NextResponse.next();
  }

  if (!refreshToken) {
    return redirectToLogin(req);
  }

  try {
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!refreshRes.ok) {
      return redirectToLogin(req);
    }
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = (await refreshRes.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const res = NextResponse.next();
    setSessionCookies(res, newAccessToken, newRefreshToken);
    return res;
  } catch {
    return redirectToLogin(req);
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
