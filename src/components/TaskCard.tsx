"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, AlertCircle, Circle, CheckCircle2, Clock, ListChecks, Link2, MessageSquare, Repeat, Users } from "lucide-react";
import { cn, priorityLabel, dueDateOnly, isTaskOverdue } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { taskResponsibles, isJointTask } from "@/lib/task-assignees";
import type { TaskListItem } from "@/types/task";

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-400/10 text-red-400",
  medium: "bg-yellow-400/10 text-yellow-400",
  low: "bg-green-400/10 text-green-400",
};

export function TaskCard({ task, onStatusChange, onClick }: { task: TaskListItem; onStatusChange?: (id: string, status: string) => void; onClick?: (task: TaskListItem) => void }) {
  const isOverdue = isTaskOverdue(task.dueDate, task.status);

  const StatusIcon =
    task.status === "done"
      ? CheckCircle2
      : task.status === "in_progress"
      ? Clock
      : task.status === "blocked"
      ? AlertCircle
      : Circle;

  const subtotal = task.subtasks?.length ?? 0;
  const subdone = task.subtasks?.filter((s) => s.done).length ?? 0;
  const linkCount = task._count?.links ?? 0;
  const commentCount = task._count?.comments ?? 0;
  const responsibles = taskResponsibles(task);
  const joint = isJointTask(task);
  const donePartsCount = responsibles.filter((r) => r.done).length;

  return (
    <div
      onClick={() => onClick?.(task)}
      className={cn(
        "group bg-surface border rounded-xl p-4 transition-all hover:border-o2-green/30",
        isOverdue ? "border-red-500/30" : "border-surface-3",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onStatusChange) {
              const next =
                task.status === "todo"
                  ? "in_progress"
                  : task.status === "in_progress"
                  ? "done"
                  : "todo";
              onStatusChange(task.id, next);
            }
          }}
          className="mt-0.5 flex-shrink-0"
        >
          <StatusIcon
            size={17}
            className={cn(
              "transition-colors",
              task.status === "done"
                ? "text-o2-green"
                : task.status === "in_progress"
                ? "text-blue-400"
                : task.status === "blocked"
                ? "text-red-400"
                : "text-ink-faint group-hover:text-ink-mid"
            )}
          />
        </button>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              task.status === "done" ? "line-through text-ink-faint" : "text-ink"
            )}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-ink-dim mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>

      {subtotal > 0 && (
        <div className="flex items-center gap-2 mt-2.5 ml-7">
          <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-o2-green/70 rounded-full transition-all"
              style={{ width: `${Math.round((subdone / subtotal) * 100)}%` }}
            />
          </div>
          <span className="flex items-center gap-1 text-[10px] text-ink-dim shrink-0">
            <ListChecks size={10} />
            {subdone}/{subtotal}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0",
              PRIORITY_BADGE[task.priority] ?? "bg-surface-3 text-ink-mid"
            )}
          >
            {priorityLabel(task.priority)}
          </span>
          {task.recurrence && <Repeat size={11} className="text-ink-faint shrink-0" />}
          {joint && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-o2-green bg-o2-green/10 px-1.5 py-0.5 rounded-full shrink-0"
              title={`Tarefa em conjunto — ${responsibles.map((r) => r.name || "Cliente").join(", ")}`}
            >
              <Users size={9} />
              {donePartsCount}/{responsibles.length}
            </span>
          )}
          {task.client && (
            <span className="text-[10px] text-ink-faint truncate">{task.client}</span>
          )}
          {task.source !== "manual" && !task.client && (
            <span className="text-[10px] text-ink-faint uppercase tracking-wide shrink-0">{task.source}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {linkCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-ink-dim">
              <Link2 size={10} />{linkCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-ink-dim">
              <MessageSquare size={10} />{commentCount}
            </span>
          )}
          {task.dueDate && (
            <div className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-red-400" : "text-ink-dim")}>
              <Calendar size={11} />
              {format(dueDateOnly(task.dueDate), "dd MMM", { locale: ptBR })}
              {task.dueTime && ` ${task.dueTime}`}
            </div>
          )}
          {/* pilha de avatares — todos os responsáveis, o dono primeiro */}
          {responsibles.length > 0 && (
            <div className="flex items-center -space-x-1.5 shrink-0">
              {responsibles.slice(0, 3).map((r, i) =>
                r.isClient ? (
                  <span
                    key={r.assigneeRowId ?? r.id}
                    title={r.name || "Cliente"}
                    className={cn(
                      "w-7 h-7 rounded-full bg-surface-3 text-ink-mid flex items-center justify-center text-[9px] font-bold ring-2 ring-surface",
                      r.done && "opacity-50"
                    )}
                  >
                    CLI
                  </span>
                ) : (
                  <span
                    key={r.assigneeRowId ?? r.id}
                    title={r.name || ""}
                    className={cn("rounded-full ring-2 ring-surface", r.done && "opacity-50")}
                  >
                    <UserAvatar name={r.name} image={r.image} size="sm" index={i} />
                  </span>
                )
              )}
              {responsibles.length > 3 && (
                <span className="w-7 h-7 rounded-full bg-surface-3 text-ink-mid flex items-center justify-center text-[9px] font-bold ring-2 ring-surface">
                  +{responsibles.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
