import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL, ADMIN_ACCESS_TOKEN_COOKIE } from "@/lib/config";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_URL}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  const store = await cookies();
  store.set(ADMIN_ACCESS_TOKEN_COOKIE, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return NextResponse.json({ admin: data.admin });
}
