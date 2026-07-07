"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, Users, Package, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Task = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assignee: { name: string | null } | null;
};

type CalendarEvent = {
  id: string;
  title: string;
  client: string;
  startAt: string;
  endAt: string;
  briefingSent: boolean;
  o2Tasks: Task[];
  clientTasks: Task[];
};

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const start = getMondayOfWeek(firstDay);
  const end = new Date(lastDay);
  const endDay = end.getDay();
  if (endDay !== 0) end.setDate(end.getDate() + (7 - endDay));
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarGrid({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<"month" | "agenda">("month");

  function navigate(deltaMonths: number) {
    let y = year;
    let m = month + deltaMonths;
    if (m < 1) { y--; m = 12; }
    if (m > 12) { y++; m = 1; }
    setSelected(null);
    router.push(`/calendar?year=${y}&month=${m}`);
  }

  function goToToday() {
    const now = new Date();
    setSelected(null);
    router.push(`/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  }

  const days = buildCalendarDays(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function eventsForDay(day: Date) {
    return events.filter(e => sameDay(new Date(e.startAt), day));
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  return (
    <div className="flex flex-1 gap-0 min-h-0">
      {/* Calendar side */}
      <div className={cn("flex flex-col flex-1 min-w-0 transition-all", selected ? "lg:mr-80" : "")}>
        {/* Navigation */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-3 transition-all"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-ink px-2 min-w-[130px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-3 transition-all"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-surface border border-surface-3 rounded-lg p-0.5">
              <button
                onClick={() => setView("month")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  view === "month" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                )}
              >
                <LayoutGrid size={12} />
                Mês
              </button>
              <button
                onClick={() => setView("agenda")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  view === "agenda" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                )}
              >
                <List size={12} />
                Agenda
              </button>
            </div>
            <button
              onClick={goToToday}
              className="px-3 py-1 rounded-lg text-xs text-ink-mid hover:text-ink border border-surface-3 hover:border-border hover:bg-surface-3 transition-all"
            >
              Hoje
            </button>
          </div>
        </div>

        {view === "month" ? (
          <>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-0.5">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-ink-ghost uppercase tracking-widest py-1.5">
                  {d}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="flex-1 grid grid-cols-7 gap-px bg-skeleton border border-skeleton rounded-xl overflow-hidden">
              {days.map((day, i) => {
                const isCurrentMonth = day.getMonth() === month - 1;
                const isToday = sameDay(day, today);
                const isPast = day < today && !isToday;
                const dayEvents = eventsForDay(day);

                return (
                  <div
                    key={i}
                    className={cn(
                      "bg-bg p-2 flex flex-col gap-1",
                      !isCurrentMonth && "bg-bg-deep",
                      isToday && "bg-green-wash"
                    )}
                    style={{ minHeight: "90px" }}
                  >
                    {/* Number */}
                    <span className={cn(
                      "text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full self-start",
                      isToday ? "bg-o2-green text-black font-black" :
                      isCurrentMonth ? "text-ink-dim" : "text-surface-3"
                    )}>
                      {day.getDate()}
                    </span>

                    {/* Events */}
                    {dayEvents.map(event => {
                      const isSelected = selected?.id === event.id;
                      const total = event.o2Tasks.length + event.clientTasks.length;
                      return (
                        <button
                          key={event.id}
                          onClick={() => setSelected(isSelected ? null : event)}
                          className={cn(
                            "text-left w-full rounded px-1.5 py-1 transition-all border text-[10px]",
                            isPast
                              ? "bg-panel border-surface-2 hover:border-border"
                              : "bg-o2-green/8 border-o2-green/15 hover:border-o2-green/35 hover:bg-o2-green/12",
                            isSelected && "border-o2-green/50 bg-o2-green/15 ring-1 ring-o2-green/15"
                          )}
                        >
                          <p className={cn(
                            "font-semibold truncate leading-tight",
                            isPast ? "text-ink-ghost" : "text-o2-green"
                          )}>
                            {event.client}
                          </p>
                          <p className={cn("truncate", isPast ? "text-border" : "text-ink-dim")}>
                            {formatTime(event.startAt)}
                            {total > 0 && ` · ${total} entrega${total > 1 ? "s" : ""}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Agenda view */
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {sortedEvents.length === 0 && (
              <div className="text-center py-16 text-ink-faint">
                <Calendar size={22} className="mx-auto mb-2 text-surface-3" />
                <p className="text-sm">Nenhuma reunião neste mês</p>
              </div>
            )}
            {sortedEvents.map((event) => {
              const start = new Date(event.startAt);
              const isPast = start < today && !sameDay(start, today);
              const isEventToday = sameDay(start, today);
              const total = event.o2Tasks.length + event.clientTasks.length;
              const isSelected = selected?.id === event.id;
              return (
                <button
                  key={event.id}
                  onClick={() => setSelected(isSelected ? null : event)}
                  className={cn(
                    "w-full flex items-center gap-4 text-left rounded-xl border px-4 py-3 transition-all",
                    isPast
                      ? "bg-panel border-surface-2 hover:border-border"
                      : "bg-surface border-surface-3 hover:border-o2-green/30",
                    isEventToday && "border-o2-green/30 bg-green-wash",
                    isSelected && "border-o2-green/50 ring-1 ring-o2-green/15"
                  )}
                >
                  <div className="flex flex-col items-center w-12 shrink-0">
                    <span className={cn(
                      "text-lg font-bold leading-none",
                      isEventToday ? "text-o2-green" : isPast ? "text-ink-ghost" : "text-ink"
                    )}>
                      {start.getDate()}
                    </span>
                    <span className="text-[10px] text-ink-faint uppercase mt-0.5">
                      {start.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold truncate", isPast ? "text-ink-faint" : "text-ink")}>
                      {event.client}
                    </p>
                    <p className="text-xs text-ink-dim truncate mt-0.5">{event.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-xs font-medium", isPast ? "text-ink-faint" : "text-ink-soft")}>
                      {formatTime(event.startAt)}
                    </p>
                    {total > 0 && (
                      <p className="text-[10px] text-o2-green mt-0.5">{total} entrega{total > 1 ? "s" : ""}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          {/* backdrop no mobile */}
          <div className="lg:hidden fixed inset-0 bg-black/50 z-10 animate-fade-in" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm lg:w-80 border-l border-surface-3 bg-bg flex flex-col overflow-y-auto z-20 animate-slide-in-right">
            <div className="p-5 border-b border-surface-3 sticky top-0 bg-bg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-o2-green font-semibold uppercase tracking-wider mb-1">
                    {new Date(selected.startAt).toLocaleDateString("pt-BR", {
                      weekday: "long", day: "2-digit", month: "long"
                    })}
                    {" · "}
                    {formatTime(selected.startAt)}
                  </p>
                  <h2 className="text-sm font-bold text-ink leading-tight">
                    {selected.title}
                  </h2>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-ink-faint hover:text-ink text-xl leading-none mt-0.5 flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 space-y-6">
              {/* O2 deliveries */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={12} className="text-o2-green" />
                  <h3 className="text-[10px] font-bold text-ink-mid uppercase tracking-wider">
                    O2 entrega para {selected.client}
                  </h3>
                </div>
                {selected.o2Tasks.length === 0 ? (
                  <p className="text-xs text-border italic pl-4">Nenhuma entrega pendente</p>
                ) : (
                  <ul className="space-y-2.5 pl-4">
                    {selected.o2Tasks.map(task => (
                      <li key={task.id} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-o2-green/50 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-ink-soft leading-snug">{task.title}</p>
                          {task.assignee && (
                            <p className="text-[10px] text-o2-green/60 mt-0.5">→ {task.assignee.name}</p>
                          )}
                          {task.dueDate && (
                            <p className="text-[10px] text-ink-ghost mt-0.5">
                              prazo: {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Client deliveries */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users size={12} className="text-blue-400" />
                  <h3 className="text-[10px] font-bold text-ink-mid uppercase tracking-wider">
                    {selected.client} entrega para O2
                  </h3>
                </div>
                {selected.clientTasks.length === 0 ? (
                  <p className="text-xs text-border italic pl-4">Nenhuma entrega pendente</p>
                ) : (
                  <ul className="space-y-2.5 pl-4">
                    {selected.clientTasks.map(task => (
                      <li key={task.id} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400/50 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-ink-soft leading-snug">{task.title}</p>
                          {task.assignee && (
                            <p className="text-[10px] text-blue-400/60 mt-0.5">→ {task.assignee.name}</p>
                          )}
                          {task.dueDate && (
                            <p className="text-[10px] text-ink-ghost mt-0.5">
                              prazo: {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {selected.o2Tasks.length === 0 && selected.clientTasks.length === 0 && (
                <div className="text-center py-8">
                  <Calendar size={22} className="text-surface-3 mx-auto mb-2" />
                  <p className="text-xs text-border">Nenhuma entrega registrada</p>
                  <p className="text-[10px] text-surface-3 mt-1">
                    As tarefas aparecem aqui quando extraídas dos Meet Recaps
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
