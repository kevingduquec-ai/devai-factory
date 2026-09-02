import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/integrations/connections/${id}`, { method: "DELETE" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
