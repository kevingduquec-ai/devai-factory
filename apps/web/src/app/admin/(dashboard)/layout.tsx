import { AdminLogoutButton } from "../logout-button";
import { AdminNavLinks } from "../admin-nav-links";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-y-2 bg-qubit-navy px-6 py-3">
        <div>
          <p className="font-heading text-sm font-bold leading-tight text-white">Qubit Admin</p>
          <p className="text-xs leading-tight text-white/60">Panel de super-administración</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <AdminNavLinks />
          <AdminLogoutButton />
        </div>
      </header>
      <main className="flex-1 bg-background px-6 py-8">{children}</main>
    </div>
  );
}
