import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET() {
  const res = await apiFetch("/support/unread-count");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
