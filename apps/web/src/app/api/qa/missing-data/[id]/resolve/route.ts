import { NextRequest, NextResponse } from "next/server";
import { apiFetchWithRefresh as apiFetch } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  const res = await apiFetch(`/qa/missing-data/${id}/resolve`, { method: "POST", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
