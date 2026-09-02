"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/error-message";

export default function RegisterPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo crear la cuenta"));
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Image
            src="/qubit-icon.png"
            alt="Qubit"
            width={44}
            height={38}
            className="mx-auto"
            style={{ height: "auto" }}
          />
          <h1 className="font-heading text-2xl font-bold">Crea tu cuenta</h1>
          <p className="text-sm text-muted">Crea tu cuenta y elige tu plan en el siguiente paso</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="organizationName">Nombre de tu empresa</Label>
            <Input
              id="organizationName"
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Tu nombre</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted">Mínimo 8 caracteres</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-qubit-blue-600 underline dark:text-qubit-blue-400">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
