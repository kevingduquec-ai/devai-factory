import { NextResponse } from "next/server";
import { clearSessionCookies } from "../_set-session";

export async function POST() {
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
