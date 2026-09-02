"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

export function InviteUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orgs/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo enviar la invitación"));
      }
      setEmail("");
      if (data.inviteUrl) {
        // No hay proveedor de correo configurado: se muestra el link para copiarlo manualmente.
        setInviteUrl(data.inviteUrl);
      } else {
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Invitar persona
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted" htmlFor="invite-email">
            Correo
          </label>
          <Input
            id="invite-email"
            type="email"
            required
            placeholder="persona@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-40 space-y-1">
          <label className="text-xs font-medium text-muted" htmlFor="invite-role">
            Rol
          </label>
          <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Miembro</option>
            <option value="admin">Administrador</option>
          </Select>
        </div>
        <Button type="submit" loading={loading}>
          {loading ? "Enviando..." : "Enviar invitación"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {inviteUrl && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No hay un proveedor de correo configurado todavía, así que comparte este link manualmente con la persona invitada:
          <br />
          <code className="break-all">{inviteUrl}</code>
        </div>
      )}
    </div>
  );
}
