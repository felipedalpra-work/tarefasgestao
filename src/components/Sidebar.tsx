"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, CheckSquare, Kanban, FileText, Settings, LogOut, CalendarDays, Building2, Search, ScrollText, CalendarRange, Menu, X, ShieldAlert } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { NotificationsBell } from "./NotificationsBell";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/week", label: "Minha Semana", icon: CalendarRange },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/kanban", label: "Kanban", icon: Kanban },
  { href: "/calendar", label: "Calendário", icon: CalendarDays },
  { href: "/recaps", label: "Meet Recaps", icon: FileText },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/tratativas", label: "Tratativas", icon: ShieldAlert },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // fecha o drawer ao navegar
  useEffect(() => { setMobileOpen(false); }, [path]);

  const content = (
    <>
      {/* Logo */}
      <div className="px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-o2-green tracking-tight">O2</span>
            <span className="text-xs text-ink-mid uppercase tracking-widest font-medium mt-1">Squad</span>
          </div>
          <p className="text-[10px] text-ink-faint mt-0.5">gestão fluída.</p>
        </div>
        <button onClick={() => setMobileOpen(false)} className="md:hidden text-ink-mid hover:text-ink p-1">
          <X size={18} />
        </button>
      </div>

      {/* Search + Notifications */}
      <div className="mx-3 mt-3 flex items-center gap-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg border border-surface-3 text-ink-faint hover:text-ink-mid hover:border-border transition-all text-xs"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Buscar…</span>
          <kbd className="text-[10px] border border-surface-3 rounded px-1 py-0.5">⌘K</kbd>
        </button>
        <NotificationsBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              path === href
                ? "bg-o2-green/10 text-o2-green"
                : "text-ink-mid hover:text-ink hover:bg-surface-3"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-4 border-t border-surface-3 pt-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-mid hover:text-red-400 hover:bg-red-400/10 transition-all w-full"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14 bg-surface border-b border-surface-3">
        <button onClick={() => setMobileOpen(true)} className="text-ink-mid hover:text-ink p-1">
          <Menu size={20} />
        </button>
        <span className="text-lg font-black text-o2-green tracking-tight">O2</span>
        <span className="text-[10px] text-ink-mid uppercase tracking-widest font-medium">Squad</span>
        <button onClick={() => setSearchOpen(true)} className="ml-auto text-ink-mid hover:text-ink p-1">
          <Search size={18} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-64 z-50 flex flex-col bg-surface border-r border-surface-3 animate-fade-in">
            {content}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-surface border-r border-surface-3 h-screen sticky top-0">
        {content}
      </aside>
    </>
  );
}
