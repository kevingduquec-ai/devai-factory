import { NextResponse } from "next/server";
import { apiFetchWithRefresh as apiFetch } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/qa/modules/${id}/discover`, { method: "POST" });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    // El backend tardó tanto (detección real con Playwright) que la conexión
    // se cortó a mitad de respuesta, o devolvió un cuerpo vacío/no-JSON —
    // sin este catch, ese caso rompía el .json() del cliente con un
    // SyntaxError críptico en vez de un mensaje entendible.
    return NextResponse.json(
      { message: "El servidor tardó demasiado o no respondió. Intenta detectar la estructura de nuevo." },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}
