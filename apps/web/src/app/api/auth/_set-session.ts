import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/config";

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  store.set(ACCESS_TOKEN_COOKIE, accessToken, { ...common, maxAge: 60 * 15 });
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, { ...common, maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}
