import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  const res = await apiFetch(`/integrations/connections/${id}/target`, { method: "PATCH", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
