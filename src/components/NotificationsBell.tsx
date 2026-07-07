"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AtSign, UserPlus, MessageSquare, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  assigned: UserPlus,
  mention: AtSign,
  comment: MessageSquare,
  recap: Sparkles,
};

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // silencioso — polling tenta de novo
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // marca todas como lidas ao abrir
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnread(0);
    }
  }

  function openItem(n: Notification) {
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-lg transition-all",
          open ? "bg-surface-3 text-ink" : "text-ink-mid hover:text-ink hover:bg-surface-3"
        )}
        title="Notificações"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-o2-green text-bg text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-12 md:bottom-auto md:top-11 z-50 w-80 max-h-96 overflow-y-auto bg-surface border border-surface-3 rounded-xl shadow-2xl animate-slide-in-up">
          <div className="px-4 py-3 border-b border-surface-3">
            <p className="text-xs font-semibold text-ink uppercase tracking-wide">Notificações</p>
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-ink-faint text-center py-8">Nenhuma notificação ainda</p>
          ) : (
            <div>
              {items.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 border-b border-surface-2 last:border-0",
                      !n.readAt && "bg-o2-green/5"
                    )}
                  >
                    <Icon size={14} className={cn("mt-0.5 shrink-0", !n.readAt ? "text-o2-green" : "text-ink-faint")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-ink-soft leading-snug">{n.message}</p>
                      <p className="text-[10px] text-ink-faint mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-o2-green mt-1.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
