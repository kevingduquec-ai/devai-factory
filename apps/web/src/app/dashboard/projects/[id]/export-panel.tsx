"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/lib/error-message";

type Format = "pdf" | "docx";
type CsvTarget = "jira" | "clickup";

/** Descarga la respuesta ya obtenida vía fetch (para poder revisar errores antes de guardar el archivo, y sin repetir la petición). */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState<Format | CsvTarget | null>(null);
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

  async function onExportCsv(target: CsvTarget) {
    setError(null);
    setLoading(target);
    try {
      const res = await fetch(`/api/projects/${projectId}/export/csv/${target}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(extractErrorMessage(data, "No se pudo generar el archivo CSV"));
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const blob = await res.blob();
      downloadBlob(blob, filenameMatch?.[1] ?? `proyecto-${target}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onExport("pdf")} loading={loading === "pdf"} disabled={loading !== null}>
          {loading === "pdf" ? "Generando PDF..." : "Exportar a PDF"}
        </Button>
        <Button variant="secondary" onClick={() => onExport("docx")} loading={loading === "docx"} disabled={loading !== null}>
          {loading === "docx" ? "Generando Word..." : "Exportar a Word"}
        </Button>
        <Button variant="secondary" onClick={() => onExportCsv("jira")} loading={loading === "jira"} disabled={loading !== null}>
          {loading === "jira" ? "Generando CSV..." : "CSV para Jira"}
        </Button>
        <Button variant="secondary" onClick={() => onExportCsv("clickup")} loading={loading === "clickup"} disabled={loading !== null}>
          {loading === "clickup" ? "Generando CSV..." : "CSV para ClickUp"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Los archivos CSV traen las columnas listas para el importador nativo de cada herramienta (Jira: Settings →
        System → External system import; ClickUp: Settings → Imports/Exports → Spreadsheet).
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
