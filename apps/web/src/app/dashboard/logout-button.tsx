"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="font-accent rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
    >
      {loading ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}
