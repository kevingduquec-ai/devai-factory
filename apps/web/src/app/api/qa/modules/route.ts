import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET() {
  const res = await apiFetch("/qa/modules");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await apiFetch("/qa/modules", { method: "POST", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
