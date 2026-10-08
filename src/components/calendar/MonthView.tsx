"use client";

import { useEffect, useRef, useState } from "react";
import { CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { sameDay, formatTime } from "./types";
import type { CalendarEvent, Task } from "./types";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function buildMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const start = new Date(firstDay);
  const startDow = start.getDay();
  start.setDate(start.getDate() + (startDow === 0 ? -6 : 1 - startDow));
  const end = new Date(lastDay);
  const endDow = end.getDay();
  if (endDow !== 0) end.setDate(end.getDate() + (7 - endDow));
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

type DayItem =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "task"; task: Task };

const MAX_VISIBLE = 3;

export function MonthView({
  year,
  month,
  eventsForDay,
  tasksForDay,
  selectedEventId,
  onSelectEvent,
  onSelectTask,
}: {
  year: number;
  month: number;
  eventsForDay: (day: Date) => CalendarEvent[];
  tasksForDay: (day: Date) => Task[];
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const [popover, setPopover] = useState<{ day: Date; items: DayItem[]; top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopover(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  const days = buildMonthDays(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function itemsFor(day: Date): DayItem[] {
    const items: DayItem[] = eventsForDay(day).map((event) => ({ kind: "event", event }));
    for (const task of tasksForDay(day)) items.push({ kind: "task", task });
    return items;
  }

  function openPopover(day: Date, items: DayItem[], e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 300);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 360);
    setPopover({ day, items, top, left });
  }

  return (
    <>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map((d) => (
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
          const items = itemsFor(day);
          const visible = items.slice(0, MAX_VISIBLE);
          const hiddenCount = items.length - visible.length;

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
              <span
                className={cn(
                  "text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full self-start",
                  isToday ? "bg-o2-green text-black font-black" : isCurrentMonth ? "text-ink-dim" : "text-surface-3"
                )}
              >
                {day.getDate()}
              </span>

              {visible.map((item) =>
                item.kind === "event" ? (
                  <EventChip
                    key={item.event.id}
                    event={item.event}
                    isPast={isPast}
                    isSelected={selectedEventId === item.event.id}
                    onClick={() => onSelectEvent(item.event)}
                  />
                ) : (
                  <TaskChip key={item.task.id} task={item.task} isPast={isPast} onClick={() => onSelectTask(item.task.id)} />
                )
              )}

              {hiddenCount > 0 && (
                <button
                  onClick={(e) => openPopover(day, items, e)}
                  className="text-[9px] text-ink-ghost hover:text-ink-dim pl-1 text-left"
                >
                  +{hiddenCount} mais
                </button>
              )}
            </div>
          );
        })}
      </div>

      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-30 w-72 max-h-80 overflow-y-auto bg-surface border border-surface-3 rounded-xl shadow-xl p-3 animate-fade-in"
          style={{ top: popover.top, left: popover.left }}
        >
          <p className="text-xs font-semibold text-ink mb-2">
            {popover.day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <div className="space-y-1">
            {popover.items.map((item) =>
              item.kind === "event" ? (
                <EventChip
                  key={item.event.id}
                  event={item.event}
                  isPast={false}
                  isSelected={selectedEventId === item.event.id}
                  onClick={() => {
                    onSelectEvent(item.event);
                    setPopover(null);
                  }}
                />
              ) : (
                <TaskChip
                  key={item.task.id}
                  task={item.task}
                  isPast={false}
                  onClick={() => {
                    onSelectTask(item.task.id);
                    setPopover(null);
                  }}
                />
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EventChip({
  event,
  isPast,
  isSelected,
  onClick,
}: {
  event: CalendarEvent;
  isPast: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = event.o2Tasks.length + event.clientTasks.length;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left w-full rounded px-1.5 py-1 transition-all border text-[10px]",
        isPast ? "bg-panel border-surface-2 hover:border-border" : "bg-o2-green/8 border-o2-green/15 hover:border-o2-green/35 hover:bg-o2-green/12",
        isSelected && "border-o2-green/50 bg-o2-green/15 ring-1 ring-o2-green/15"
      )}
    >
      <p className={cn("font-semibold truncate leading-tight", isPast ? "text-ink-ghost" : "text-o2-green")}>{event.client}</p>
      <p className={cn("truncate", isPast ? "text-border" : "text-ink-dim")}>
        {formatTime(event.startAt)}
        {total > 0 && ` · ${total} entrega${total > 1 ? "s" : ""}`}
      </p>
    </button>
  );
}

function TaskChip({ task, isPast, onClick }: { task: Task; isPast: boolean; onClick: () => void }) {
  const isDone = task.status === "done";
  const isOverdue = !isDone && isPast;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] truncate transition-colors w-full text-left",
        isDone ? "text-ink-ghost line-through" : isOverdue ? "text-red-400 bg-red-400/8 hover:bg-red-400/15" : "text-blue-400 bg-blue-400/8 hover:bg-blue-400/15"
      )}
    >
      <CheckSquare size={9} className="shrink-0" />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

