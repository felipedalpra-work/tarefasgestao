"use client";

import { Calendar, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { sameDay, formatTime } from "./types";
import type { CalendarEvent, Task } from "./types";

export function ScheduleView({
  days,
  eventsForDay,
  tasksForDay,
  selectedEventId,
  onSelectEvent,
  onSelectTask,
}: {
  days: Date[];
  eventsForDay: (day: Date) => CalendarEvent[];
  tasksForDay: (day: Date) => Task[];
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const agendaDays = days
    .map((day) => ({ day, dayEvents: eventsForDay(day), dayTasks: tasksForDay(day) }))
    .filter((d) => d.dayEvents.length > 0 || d.dayTasks.length > 0);

  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      {agendaDays.length === 0 && (
        <div className="text-center py-16 text-ink-faint">
          <Calendar size={22} className="mx-auto mb-2 text-surface-3" />
          <p className="text-sm">Nada agendado neste período</p>
        </div>
      )}
      {agendaDays.map(({ day, dayEvents, dayTasks }) => {
        const isPast = day < today && !sameDay(day, today);
        const isDayToday = sameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "rounded-xl border px-4 py-3 transition-all",
              isPast ? "bg-panel border-surface-2" : "bg-surface border-surface-3",
              isDayToday && "border-o2-green/30 bg-green-wash"
            )}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex flex-col items-center w-9 shrink-0">
                <span className={cn("text-base font-bold leading-none", isDayToday ? "text-o2-green" : isPast ? "text-ink-ghost" : "text-ink")}>
                  {day.getDate()}
                </span>
                <span className="text-[9px] text-ink-faint uppercase mt-0.5">
                  {day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                </span>
              </div>
              <div className="h-px flex-1 bg-surface-3" />
            </div>

            {dayEvents.length > 0 && (
              <div className="space-y-1.5 mb-1.5">
                {dayEvents.map((event) => {
                  const total = event.o2Tasks.length + event.clientTasks.length;
                  const isSelected = selectedEventId === event.id;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      className={cn(
                        "w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-1.5 transition-all",
                        isSelected ? "bg-o2-green/15 ring-1 ring-o2-green/25" : "hover:bg-surface-2"
                      )}
                    >
                      <Calendar size={13} className="text-o2-green shrink-0" />
                      <span className={cn("text-xs font-semibold truncate flex-1", isPast ? "text-ink-faint" : "text-ink")}>{event.client}</span>
                      <span className={cn("text-[11px] shrink-0", isPast ? "text-ink-faint" : "text-ink-soft")}>{formatTime(event.startAt)}</span>
                      {total > 0 && <span className="text-[10px] text-o2-green shrink-0">{total} entrega{total > 1 ? "s" : ""}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {dayTasks.length > 0 && (
              <div className="space-y-1">
                {dayTasks.map((task) => {
                  const isDone = task.status === "done";
                  const isOverdue = !isDone && isPast;
                  return (
                    <button
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-surface-2 transition-colors text-left"
                    >
                      <CheckSquare size={13} className={cn("shrink-0", isDone ? "text-ink-ghost" : isOverdue ? "text-red-400" : "text-blue-400")} />
                      <span className={cn("text-xs truncate flex-1", isDone ? "text-ink-ghost line-through" : isOverdue ? "text-red-400" : "text-ink-soft")}>
                        {task.title}
                      </span>
                      {task.client && <span className="text-[10px] text-ink-faint shrink-0 truncate max-w-[100px]">{task.client}</span>}
                      {task.assignee?.name && <span className="text-[10px] text-ink-faint shrink-0">{task.assignee.name}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
