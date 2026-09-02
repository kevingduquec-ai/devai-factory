import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await apiFetch("/projects", { method: "POST", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
