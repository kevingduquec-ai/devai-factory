import { NextRequest, NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/admin-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const body = await req.text();
  const res = await adminApiFetch(`/admin/support/conversations/${orgId}/status`, { method: "PATCH", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
