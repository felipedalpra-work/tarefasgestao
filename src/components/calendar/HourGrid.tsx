"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { cn, brtNow } from "@/lib/utils";
import { sameDay, formatTime } from "./types";
import type { CalendarEvent, Task } from "./types";

const HOUR_HEIGHT = 56; // px
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// layout simples de colunas lado a lado pra reunião que se sobrepõe no horário —
// coluna = primeira livre (nenhuma reunião ativa ocupando), reaproveitada assim
// que a anterior termina. maxCols é global do dia (não por cluster), mais simples
// e suficiente pro volume de reuniões que um squad tem por dia.
function layoutEvents(events: CalendarEvent[]): { colOf: Map<string, number>; maxCols: number } {
  const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const columns: (CalendarEvent | null)[] = [];
  const colOf = new Map<string, number>();
  let maxCols = 1;
  for (const ev of sorted) {
    const start = new Date(ev.startAt).getTime();
    for (let i = 0; i < columns.length; i++) {
      const occ = columns[i];
      if (occ && new Date(occ.endAt).getTime() <= start) columns[i] = null;
    }
    let col = columns.findIndex((c) => c === null);
    if (col === -1) {
      col = columns.length;
      columns.push(ev);
    } else {
      columns[col] = ev;
    }
    colOf.set(ev.id, col);
    maxCols = Math.max(maxCols, columns.filter((c) => c !== null).length, col + 1);
  }
  return { colOf, maxCols };
}

export function HourGrid({
  days,
  eventsForDay,
  tasksForDay,
  selectedEventId,
  onSelectEvent,
}: {
  days: Date[];
  eventsForDay: (day: Date) => CalendarEvent[];
  tasksForDay: (day: Date) => Task[];
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { minutesOfDay } = brtNow();

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = Math.max(0, (minutesOfDay / 60) * HOUR_HEIGHT - 160);
    scrollRef.current.scrollTop = target;
    // roda só uma vez ao montar a visão — não quer rolar de novo a cada re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface border border-surface-3 rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-surface-3 shrink-0">
        <div className="w-12 shrink-0" />
        {days.map((day) => {
          const isToday = sameDay(day, today);
          return (
            <div key={day.toISOString()} className="flex-1 min-w-0 text-center py-2 border-l border-surface-3">
              <p className="text-[9px] text-ink-ghost uppercase tracking-wide">
                {day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
              </p>
              <p className={cn("text-sm font-semibold w-6 h-6 mx-auto flex items-center justify-center rounded-full mt-0.5", isToday ? "bg-o2-green text-black" : "text-ink")}>
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-day tasks (sem dueTime) */}
      <div className="flex border-b border-surface-3 shrink-0 min-h-[28px]">
        <div className="w-12 shrink-0 text-[8px] text-ink-ghost text-right pr-1.5 pt-1.5">dia todo</div>
        {days.map((day) => {
          const allDayTasks = tasksForDay(day).filter((t) => !t.dueTime);
          return (
            <div key={day.toISOString()} className="flex-1 min-w-0 border-l border-surface-3 p-1 space-y-0.5">
              {allDayTasks.map((task) => (
                <TaskChip key={task.id} task={task} isPast={day < today} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable hour body */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex" style={{ height: DAY_HEIGHT }}>
          <div className="w-12 shrink-0 relative">
            {HOURS.map((h) => (
              <span key={h} className="absolute right-1.5 text-[9px] text-ink-ghost -translate-y-1/2" style={{ top: h * HOUR_HEIGHT }}>
                {h === 0 ? "" : `${h}h`}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const isToday = sameDay(day, today);
            const dayEvents = eventsForDay(day);
            const timedTasks = tasksForDay(day).filter((t) => t.dueTime);
            const { colOf, maxCols } = layoutEvents(dayEvents);

            return (
              <div key={day.toISOString()} className="flex-1 min-w-0 relative border-l border-surface-3" style={{ height: DAY_HEIGHT }}>
                {HOURS.map((h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-surface-2" style={{ top: h * HOUR_HEIGHT }} />
                ))}

                {isToday && (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-red-400 z-10 pointer-events-none"
                    style={{ top: (minutesOfDay / 60) * HOUR_HEIGHT }}
                  />
                )}

                {dayEvents.map((event) => {
                  const start = minutesOf(event.startAt);
                  const end = Math.max(minutesOf(event.endAt), start + 20);
                  const col = colOf.get(event.id) ?? 0;
                  const width = 100 / maxCols;
                  const total = event.o2Tasks.length + event.clientTasks.length;
                  const isSelected = selectedEventId === event.id;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      className={cn(
                        "absolute rounded px-1.5 py-0.5 text-left border overflow-hidden text-[10px] transition-all",
                        "bg-o2-green/10 border-o2-green/25 hover:border-o2-green/45 hover:bg-o2-green/15",
                        isSelected && "border-o2-green/60 ring-1 ring-o2-green/20"
                      )}
                      style={{
                        top: (start / 60) * HOUR_HEIGHT + 1,
                        height: ((end - start) / 60) * HOUR_HEIGHT - 2,
                        left: `calc(${col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <p className="font-semibold text-o2-green truncate leading-tight">{event.client}</p>
                      <p className="text-ink-dim truncate">
                        {formatTime(event.startAt)}
                        {total > 0 && ` · ${total} entrega${total > 1 ? "s" : ""}`}
                      </p>
                    </button>
                  );
                })}

                {timedTasks.map((task) => {
                  const [hh, mm] = (task.dueTime || "0:0").split(":").map(Number);
                  const start = hh * 60 + mm;
                  const isDone = task.status === "done";
                  const isOverdue = !isDone && day < today;
                  return (
                    <Link
                      key={task.id}
                      href={`/tasks?task=${task.id}`}
                      className={cn(
                        "absolute left-0.5 right-0.5 flex items-center gap-1 rounded px-1 text-[9px] truncate border-l-2",
                        isDone
                          ? "text-ink-ghost line-through border-surface-3 bg-surface-2/50"
                          : isOverdue
                          ? "text-red-400 bg-red-400/10 border-red-400"
                          : "text-blue-400 bg-blue-400/10 border-blue-400"
                      )}
                      style={{ top: (start / 60) * HOUR_HEIGHT + 1, height: 18 }}
                    >
                      <CheckSquare size={8} className="shrink-0" />
                      <span className="truncate">{task.title}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaskChip({ task, isPast }: { task: Task; isPast: boolean }) {
  const isDone = task.status === "done";
  const isOverdue = !isDone && isPast;
  return (
    <Link
      href={`/tasks?task=${task.id}`}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] truncate transition-colors",
        isDone ? "text-ink-ghost line-through" : isOverdue ? "text-red-400 bg-red-400/8 hover:bg-red-400/15" : "text-blue-400 bg-blue-400/8 hover:bg-blue-400/15"
      )}
    >
      <CheckSquare size={9} className="shrink-0" />
      <span className="truncate">{task.title}</span>
    </Link>
  );
}
