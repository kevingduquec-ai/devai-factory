"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/lib/error-message";

export function UpgradeButton({ plan, disabled }: { plan: "starter" | "team"; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo iniciar el pago"));
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={onClick} loading={loading} disabled={disabled} className="w-full">
        {loading ? "Redirigiendo a pago..." : "Cambiar a este plan"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo abrir el portal de facturación"));
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="secondary" onClick={onClick} loading={loading}>
        {loading ? "Abriendo..." : "Gestionar facturación"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
