"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
  { href: "/dashboard", label: "Análisis completo" },
  { href: "/dashboard/quick-stories", label: "Historia de usuario" },
  { href: "/dashboard/billing", label: "Facturación" },
];

/**
 * Los links de "Integraciones" y "QA-AI" solo aparecen si el super-admin
 * activó ese add-on para esta persona — nunca se muestra una función que
 * no puede usar (mismo criterio para ambos módulos add-on).
 */
export function NavLinks({ integrationsEnabled, qaAutomationEnabled }: { integrationsEnabled: boolean; qaAutomationEnabled: boolean }) {
  const pathname = usePathname();
  const LINKS = [
    ...BASE_LINKS,
    ...(integrationsEnabled ? [{ href: "/dashboard/integrations", label: "Integraciones" }] : []),
    ...(qaAutomationEnabled ? [{ href: "/dashboard/qa", label: "QA-AI" }] : []),
  ];

  return (
    <>
      {LINKS.map((link) => {
        const isActive =
          link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition ${isActive ? "font-medium text-white" : "text-white/80 hover:text-white"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
