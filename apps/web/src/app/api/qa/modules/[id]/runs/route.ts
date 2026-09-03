import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/qa/modules/${id}/runs`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
