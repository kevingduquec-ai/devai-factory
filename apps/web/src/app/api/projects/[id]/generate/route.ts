import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/projects/${id}/generate`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
