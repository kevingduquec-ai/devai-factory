"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/lib/error-message";

type Format = "pdf" | "docx";

export function ExportPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onExport(format: Format) {
    setError(null);
    setLoading(format);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo generar el documento"));
      }
      window.location.href = `/api/projects/${projectId}/documents/${data.id}/download`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onExport("pdf")} loading={loading === "pdf"} disabled={loading !== null}>
          {loading === "pdf" ? "Generando PDF..." : "Exportar a PDF"}
        </Button>
        <Button variant="secondary" onClick={() => onExport("docx")} loading={loading === "docx"} disabled={loading !== null}>
          {loading === "docx" ? "Generando Word..." : "Exportar a Word"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
