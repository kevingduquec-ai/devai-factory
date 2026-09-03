import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/qa/runs/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
