import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params;
  const res = await apiFetch(`/projects/${id}/documents/${documentId}/download`);
  if (!res.ok) {
    return NextResponse.json({ message: "No se pudo descargar el documento" }, { status: res.status });
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
