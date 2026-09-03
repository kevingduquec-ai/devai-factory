import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/qa/runs/${id}/report`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "No se pudo descargar el reporte" }, { status: res.status });
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
