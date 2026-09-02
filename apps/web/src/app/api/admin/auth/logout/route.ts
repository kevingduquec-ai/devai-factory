import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_ACCESS_TOKEN_COOKIE } from "@/lib/config";

export async function POST() {
  const store = await cookies();
  store.delete(ADMIN_ACCESS_TOKEN_COOKIE);
  return NextResponse.json({ ok: true });
}
