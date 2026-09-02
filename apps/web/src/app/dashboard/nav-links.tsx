"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
  { href: "/dashboard", label: "Análisis completo" },
  { href: "/dashboard/quick-stories", label: "Historia de usuario" },
  { href: "/dashboard/billing", label: "Facturación" },
];

/**
 * El link de "Integraciones" solo aparece si el super-admin activó el
 * add-on para esta persona — nunca se muestra una función que no puede
 * usar (ver módulo Jira/ClickUp, sección "control de activación").
 */
export function NavLinks({ integrationsEnabled }: { integrationsEnabled: boolean }) {
  const pathname = usePathname();
  const LINKS = integrationsEnabled
    ? [...BASE_LINKS, { href: "/dashboard/integrations", label: "Integraciones" }]
    : BASE_LINKS;

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
