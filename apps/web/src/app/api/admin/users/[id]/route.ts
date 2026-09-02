import { NextRequest, NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/admin-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const res = await adminApiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
