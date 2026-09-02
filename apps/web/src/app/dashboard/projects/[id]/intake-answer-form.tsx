"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

export function IntakeAnswerForm({ projectId, questions }: { projectId: string; questions: string[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/intake/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudieron guardar las respuestas"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {questions.map((q, i) => (
        <div key={i} className="space-y-1">
          <Label>{q}</Label>
          <Textarea
            required
            rows={2}
            value={answers[i]}
            onChange={(e) => {
              const next = [...answers];
              next[i] = e.target.value;
              setAnswers(next);
            }}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? "Guardando..." : "Enviar respuestas"}
      </Button>
    </form>
  );
}
