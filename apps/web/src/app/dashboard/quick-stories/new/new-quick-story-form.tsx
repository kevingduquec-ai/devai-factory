"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

export function NewQuickStoryForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/projects/quick-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo crear la historia"));
      }
      router.push(`/dashboard/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Solicitud de préstamo en línea"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="description">Describe la necesidad</Label>
        <Textarea
          id="description"
          required
          minLength={10}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Como cliente quiero solicitar un préstamo en línea llenando un formulario y adjuntando mis documentos de respaldo, para no tener que ir presencialmente a la oficina."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? "Creando..." : "Continuar"}
      </Button>
    </form>
  );
}
