import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function POST() {
  const res = await apiFetch("/billing/portal", { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
