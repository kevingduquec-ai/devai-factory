import { NextRequest, NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/admin-api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const res = await adminApiFetch(`/admin/support/conversations/${orgId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const body = await req.text();
  const res = await adminApiFetch(`/admin/support/conversations/${orgId}`, { method: "POST", body });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
