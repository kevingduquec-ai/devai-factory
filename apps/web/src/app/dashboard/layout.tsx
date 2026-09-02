import Image from "next/image";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { LogoutButton } from "./logout-button";
import { NavLinks } from "./nav-links";
import { SupportWidget } from "./support-widget";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-y-2 bg-qubit-navy px-6 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <Image src="/qubit-icon.png" alt="Qubit" width={30} height={26} style={{ height: "auto" }} />
          <div>
            <p className="font-heading text-sm font-bold leading-tight">Qubit</p>
            <p className="text-xs leading-tight text-white/60">{session.organization.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NavLinks />
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 bg-background px-6 py-8">{children}</main>
      <SupportWidget />
    </div>
  );
}
