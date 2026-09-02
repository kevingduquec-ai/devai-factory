import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await apiFetch("/billing/checkout", { method: "POST", body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
