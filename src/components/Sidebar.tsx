"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, CheckSquare, Kanban, FileText, Settings, LogOut, CalendarDays, Building2, Search, ScrollText, CalendarRange, Menu, X, ShieldAlert, Sparkles, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { NotificationsBell } from "./NotificationsBell";
import { LogoIcon } from "./LogoIcon";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { id: string; label: string; items: NavItem[] };

const topLevel: NavItem = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const navGroups: NavGroup[] = [
  {
    id: "tarefas",
    label: "Tarefas",
    items: [
      { href: "/week", label: "Minha Semana", icon: CalendarRange },
      { href: "/tasks", label: "Tarefas", icon: CheckSquare },
      { href: "/kanban", label: "Kanban", icon: Kanban },
      { href: "/calendar", label: "Calendário", icon: CalendarDays },
    ],
  },
  {
    id: "clientes",
    label: "Clientes",
    items: [
      { href: "/clientes", label: "Clientes", icon: Building2 },
      { href: "/tratativas", label: "Tratativas", icon: ShieldAlert },
    ],
  },
  {
    id: "ia",
    label: "IA",
    items: [
      { href: "/recaps", label: "Meet Recaps", icon: FileText },
      { href: "/sugestoes-ia", label: "Sugestões da IA", icon: Sparkles },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { href: "/logs", label: "Logs", icon: ScrollText },
      { href: "/settings", label: "Configurações", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "sidebar-open-groups";

export function Sidebar() {
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/recaps/accuracy")
        .then((r) => r.json())
        .then((data) => setPendingSuggestions(data.pending ?? 0))
        .catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // fecha o drawer ao navegar
  useEffect(() => { setMobileOpen(false); }, [path]);

  // restaura os blocos que o usuário deixou abertos manualmente
  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (stored.length) setOpenGroups((prev) => new Set([...prev, ...stored]));
    } catch {}
  }, []);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function renderItem({ href, label, icon: Icon }: NavItem) {
    return (
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
        {href === "/sugestoes-ia" && pendingSuggestions > 0 && (
          <span className="ml-auto text-xs bg-o2-green/20 text-o2-green px-1.5 py-0.5 rounded-full">
            {pendingSuggestions}
          </span>
        )}
      </Link>
    );
  }

  const content = (
    <>
      {/* Logo */}
      <div className="px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <LogoIcon className="w-6 h-6 text-o2-green shrink-0" />
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
        {renderItem(topLevel)}

        {navGroups.map((group) => {
          const hasActive = group.items.some((i) => i.href === path);
          const isOpen = hasActive || openGroups.has(group.id);
          return (
            <div key={group.id} className="pt-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all",
                  hasActive ? "text-o2-green" : "text-ink-faint hover:text-ink-mid"
                )}
              >
                <ChevronDown size={12} className={cn("shrink-0 transition-transform", !isOpen && "-rotate-90")} />
                <span className="flex-1 text-left">{group.label}</span>
                {group.id === "ia" && pendingSuggestions > 0 && !isOpen && (
                  <span className="text-[10px] bg-o2-green/20 text-o2-green px-1.5 py-0.5 rounded-full normal-case font-medium">
                    {pendingSuggestions}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="ml-3 pl-3 border-l border-surface-3 space-y-1 mt-1">
                  {group.items.map((item) => renderItem(item))}
                </div>
              )}
            </div>
          );
        })}
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
        <LogoIcon className="w-5 h-5 text-o2-green shrink-0" />
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
