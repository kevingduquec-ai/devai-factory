"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Análisis completo" },
  { href: "/dashboard/quick-stories", label: "Historia de usuario" },
  { href: "/dashboard/billing", label: "Facturación" },
];

export function NavLinks() {
  const pathname = usePathname();

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
