"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Users } from "lucide-react";
import { cn, dueDateOnly } from "@/lib/utils";
import { CalendarToolbar } from "./calendar/CalendarToolbar";
import { MonthView } from "./calendar/MonthView";
import { HourGrid } from "./calendar/HourGrid";
import { ScheduleView } from "./calendar/ScheduleView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { TaskListItem } from "@/types/task";
import {
  sameDay,
  formatTime,
  getMondayOfWeek,
  addDays,
  toDateParam,
  parseDateParam,
  type CalendarView,
  type CalendarEvent,
  type Task,
  type UserOption,
} from "./calendar/types";

function buildMonthGridDays(year: number, month: number): Date[] {
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

export function CalendarGrid({
  view,
  anchorDate,
  events,
  tasks,
  users,
}: {
  view: CalendarView;
  anchorDate: string;
  events: CalendarEvent[];
  tasks: Task[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [contentFilter, setContentFilter] = useState<"all" | "events" | "tasks">("all");

  const anchor = parseDateParam(anchorDate);

  // abre o painel de detalhe da tarefa (TaskDetailPanel) ali mesmo no calendário —
  // antes navegava pra /tasks?task=id; busca o registro completo porque o calendário
  // só tem campos mínimos (id/título/status/prazo), o painel precisa de tudo
  // (descrição, prioridade, partes, subtarefas, comentários etc.)
  useEffect(() => {
    if (!selectedTaskId) return;
    let cancelled = false;
    fetch(`/api/tasks/${selectedTaskId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (!cancelled && t?.id) setSelectedTask(t);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  function closeTask() {
    setSelectedTaskId(null);
    setSelectedTask(null);
  }

  // o grid vem do server component (page.tsx) com os dados já carregados — refresh
  // busca de novo do servidor pra refletir a mudança sem precisar recarregar a página
  function handleTaskUpdated(task: TaskListItem) {
    setSelectedTask(task);
    router.refresh();
  }

  function handleTaskDeleted() {
    closeTask();
    router.refresh();
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function matchesPeople(candidateIds: string[]) {
    if (selectedUserIds.length === 0) return true;
    return candidateIds.some((id) => selectedUserIds.includes(id));
  }

  function eventsForDay(day: Date) {
    if (contentFilter === "tasks") return [];
    return events.filter((e) => sameDay(new Date(e.startAt), day) && matchesPeople(e.attendeeUserIds));
  }

  function tasksForDay(day: Date) {
    if (contentFilter === "events") return [];
    return tasks.filter((t) => t.dueDate && sameDay(dueDateOnly(t.dueDate), day) && matchesPeople(t.assignee ? [t.assignee.id] : []));
  }

  function navigate(view2: CalendarView, date2: Date) {
    setSelected(null);
    router.push(`/calendar?view=${view2}&date=${toDateParam(date2)}`);
  }

  function handleViewChange(newView: CalendarView) {
    navigate(newView, anchor);
  }

  function handlePrev() {
    if (view === "day") navigate(view, addDays(anchor, -1));
    else if (view === "week") navigate(view, addDays(anchor, -7));
    else navigate(view, new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  }

  function handleNext() {
    if (view === "day") navigate(view, addDays(anchor, 1));
    else if (view === "week") navigate(view, addDays(anchor, 7));
    else navigate(view, new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
  }

  function handleToday() {
    navigate(view, new Date());
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(getMondayOfWeek(anchor), i));
  const monthGridDays = buildMonthGridDays(anchor.getFullYear(), anchor.getMonth() + 1);

  const periodLabel = (() => {
    if (view === "day") return anchor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (view === "week") {
      const start = weekDays[0];
      const end = weekDays[6];
      const sameMonth = start.getMonth() === end.getMonth();
      const startLabel = start.toLocaleDateString("pt-BR", { day: "2-digit", month: sameMonth ? undefined : "short" });
      const endLabel = end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
      return `${startLabel} – ${endLabel}`;
    }
    return anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  })();

  return (
    <div className="flex flex-1 gap-0 min-h-0">
      <div className={cn("flex flex-col flex-1 min-w-0 min-h-0 transition-all", selected ? "lg:mr-80" : "")}>
        <CalendarToolbar
          view={view}
          onViewChange={handleViewChange}
          periodLabel={periodLabel}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          users={users}
          selectedUserIds={selectedUserIds}
          onToggleUser={toggleUser}
          onClearUsers={() => setSelectedUserIds([])}
          contentFilter={contentFilter}
          onContentFilterChange={setContentFilter}
        />

        {view === "month" && (
          <MonthView
            year={anchor.getFullYear()}
            month={anchor.getMonth() + 1}
            eventsForDay={eventsForDay}
            tasksForDay={tasksForDay}
            selectedEventId={selected?.id ?? null}
            onSelectEvent={setSelected}
            onSelectTask={setSelectedTaskId}
          />
        )}

        {(view === "week" || view === "day") && (
          <HourGrid
            days={view === "day" ? [anchor] : weekDays}
            eventsForDay={eventsForDay}
            tasksForDay={tasksForDay}
            selectedEventId={selected?.id ?? null}
            onSelectEvent={setSelected}
            onSelectTask={setSelectedTaskId}
          />
        )}

        {view === "schedule" && (
          <ScheduleView
            days={monthGridDays.filter((d) => d.getMonth() === anchor.getMonth())}
            eventsForDay={eventsForDay}
            tasksForDay={tasksForDay}
            selectedEventId={selected?.id ?? null}
            onSelectEvent={setSelected}
            onSelectTask={setSelectedTaskId}
          />
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/50 z-10 animate-fade-in" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm lg:w-80 border-l border-surface-3 bg-bg flex flex-col overflow-y-auto z-20 animate-slide-in-right">
            <div className="p-5 border-b border-surface-3 sticky top-0 bg-bg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-o2-green font-semibold uppercase tracking-wider mb-1">
                    {new Date(selected.startAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                    {" · "}
                    {formatTime(selected.startAt)}
                  </p>
                  <h2 className="text-sm font-bold text-ink leading-tight">{selected.title}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="text-ink-faint hover:text-ink text-xl leading-none mt-0.5 flex-shrink-0">
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={12} className="text-o2-green" />
                  <h3 className="text-[10px] font-bold text-ink-mid uppercase tracking-wider">O2 entrega para {selected.client}</h3>
                </div>
                {selected.o2Tasks.length === 0 ? (
                  <p className="text-xs text-border italic pl-4">Nenhuma entrega pendente</p>
                ) : (
                  <ul className="space-y-2.5 pl-4">
                    {selected.o2Tasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-o2-green/50 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-ink-soft leading-snug">{task.title}</p>
                          {task.assignee && <p className="text-[10px] text-o2-green/60 mt-0.5">→ {task.assignee.name}</p>}
                          {task.dueDate && <p className="text-[10px] text-ink-ghost mt-0.5">prazo: {dueDateOnly(task.dueDate).toLocaleDateString("pt-BR")}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users size={12} className="text-blue-400" />
                  <h3 className="text-[10px] font-bold text-ink-mid uppercase tracking-wider">{selected.client} entrega para O2</h3>
                </div>
                {selected.clientTasks.length === 0 ? (
                  <p className="text-xs text-border italic pl-4">Nenhuma entrega pendente</p>
                ) : (
                  <ul className="space-y-2.5 pl-4">
                    {selected.clientTasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400/50 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-ink-soft leading-snug">{task.title}</p>
                          {task.assignee && <p className="text-[10px] text-blue-400/60 mt-0.5">→ {task.assignee.name}</p>}
                          {task.dueDate && <p className="text-[10px] text-ink-ghost mt-0.5">prazo: {dueDateOnly(task.dueDate).toLocaleDateString("pt-BR")}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {selected.o2Tasks.length === 0 && selected.clientTasks.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs text-border">Nenhuma entrega registrada</p>
                  <p className="text-[10px] text-surface-3 mt-1">As tarefas aparecem aqui quando extraídas dos Meet Recaps</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <TaskDetailPanel task={selectedTask} onClose={closeTask} onDeleted={handleTaskDeleted} onUpdated={handleTaskUpdated} users={users} />
    </div>
  );
}
