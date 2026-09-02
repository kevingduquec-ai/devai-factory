"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/admin", label: "Organizaciones" },
  { href: "/admin/support", label: "Soporte" },
];

export function AdminNavLinks() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/admin/support/unread-count");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnread(typeof data.count === "number" ? data.count : 0);
      } catch {
        // silencioso — se reintenta en el próximo poll
      }
    }
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      {LINKS.map((link) => {
        const isActive = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative text-sm transition ${isActive ? "font-medium text-white" : "text-white/80 hover:text-white"}`}
          >
            {link.label}
            {link.href === "/admin/support" && unread > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
