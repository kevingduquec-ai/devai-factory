import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; target: string }> },
) {
  const { id, target } = await params;
  const res = await apiFetch(`/projects/${id}/export/csv/${target}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "No se pudo generar el archivo CSV" }, { status: res.status });
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "text/csv; charset=utf-8",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
