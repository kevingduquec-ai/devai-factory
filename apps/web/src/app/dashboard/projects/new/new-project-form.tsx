"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo crear el proyecto"));
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
        <Label htmlFor="name">Nombre del proyecto</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Préstamos Cooperativa"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="description">¿Qué necesitas?</Label>
        <Textarea
          id="description"
          required
          minLength={10}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Necesito un sistema para controlar préstamos entre socios de una cooperativa de ahorro..."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? "Analizando descripción..." : "Continuar"}
      </Button>
    </form>
  );
}
