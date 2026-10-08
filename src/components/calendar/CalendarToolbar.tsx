"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarView, UserOption } from "./types";

const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  schedule: "Programação",
};

export function CalendarToolbar({
  view,
  onViewChange,
  periodLabel,
  onPrev,
  onNext,
  onToday,
  users,
  selectedUserIds,
  onToggleUser,
  onClearUsers,
  contentFilter,
  onContentFilterChange,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  users: UserOption[];
  selectedUserIds: string[];
  onToggleUser: (userId: string) => void;
  onClearUsers: () => void;
  contentFilter: "all" | "events" | "tasks";
  onContentFilterChange: (filter: "all" | "events" | "tasks") => void;
}) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setViewMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [viewMenuOpen]);

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-3 transition-all">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-ink px-2 min-w-[160px] text-center capitalize">{periodLabel}</span>
          <button onClick={onNext} className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-3 transition-all">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToday}
            className="px-3 py-1 rounded-lg text-xs text-ink-mid hover:text-ink border border-surface-3 hover:border-border hover:bg-surface-3 transition-all"
          >
            Hoje
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setViewMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border border-surface-3 bg-surface text-ink hover:border-border transition-all"
            >
              {VIEW_LABELS[view]}
              <ChevronDown size={12} />
            </button>
            {viewMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-surface-3 rounded-lg shadow-xl py-1 z-30">
                {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      onViewChange(v);
                      setViewMenuOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs transition-colors",
                      v === view ? "text-o2-green bg-o2-green/10 font-medium" : "text-ink-mid hover:text-ink hover:bg-surface-2"
                    )}
                  >
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 flex-wrap mb-4">
        {users.length > 0 && (
          <div className="flex items-center gap-1.5 bg-surface border border-surface-3 rounded-xl p-1 flex-wrap">
            <button
              onClick={onClearUsers}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                selectedUserIds.length === 0 ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
              )}
            >
              Todos
            </button>
            {users.map((u) => {
              const isActive = selectedUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => onToggleUser(u.id)}
                  title={u.name || u.email}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                    isActive ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      isActive ? "bg-o2-green/30 text-o2-green" : "bg-surface-3 text-ink-mid"
                    )}
                  >
                    {(u.name || u.email)[0].toUpperCase()}
                  </span>
                  {u.name?.split(" ")[0] || u.email}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center bg-surface border border-surface-3 rounded-xl p-1">
          <button
            onClick={() => onContentFilterChange("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              contentFilter === "all" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            )}
          >
            Tudo
          </button>
          <button
            onClick={() => onContentFilterChange("events")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              contentFilter === "events" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            )}
          >
            <Calendar size={12} />
            Reuniões
          </button>
          <button
            onClick={() => onContentFilterChange("tasks")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              contentFilter === "tasks" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            )}
          >
            <CheckSquare size={12} />
            Tarefas
          </button>
        </div>
      </div>
    </>
  );
}
