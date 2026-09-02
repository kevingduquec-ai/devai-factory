import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { setSessionCookies } from "../_set-session";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  await setSessionCookies(data.accessToken, data.refreshToken);
  return NextResponse.json({ user: data.user });
}
