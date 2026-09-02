import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/admin-api";

export async function GET() {
  const res = await adminApiFetch("/admin/support/conversations");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
