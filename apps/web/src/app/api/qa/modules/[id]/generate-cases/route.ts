import { NextResponse } from "next/server";
import { apiFetchWithRefresh as apiFetch } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/qa/modules/${id}/generate-cases`, { method: "POST" });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    // Igual que en discover/route.ts: la generación de casos llama a Claude
    // con un límite de tokens alto y puede tardar — si la conexión se corta
    // o el backend devuelve un cuerpo vacío, evitamos que el SyntaxError del
    // .json() se propague crudo hasta el usuario.
    return NextResponse.json(
      { message: "El servidor tardó demasiado o no respondió. Intenta generar los casos de nuevo." },
      { status: 502 },
    );
  }
  return NextResponse.json(data, { status: res.status });
}
