"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, Sparkles, Trash2 } from "lucide-react";
import { cn, dueDateOnly, isTaskOverdue, statusLabel } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { AssigneePicker } from "./AssigneePicker";
import { taskResponsibles, describeResponsibles, type AssigneeInput } from "@/lib/task-assignees";
import { toast } from "./Toaster";
import type { TaskListItem, UserOption } from "@/types/task";

const STATUS_OPTIONS = ["todo", "in_progress", "blocked", "done"];

// Linha de tarefa compacta e 100% editável no lugar — pensada pra revisão semanal: sem
// abrir painel nenhum, dá pra mudar status/prazo/responsável e seguir pro próximo item.
export function WeeklyReviewTaskRow({
  task,
  isNew,
  client,
  users,
  onUpdated,
  onDeleted,
}: {
  task: TaskListItem;
  isNew: boolean;
  client: string;
  users: UserOption[];
  onUpdated: (task: TaskListItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const responsibles = taskResponsibles(task);
  const overdue = isTaskOverdue(task.dueDate, task.status);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      onUpdated({ ...task, ...(await res.json()) });
    } else {
      toast("Erro ao salvar a tarefa", "error");
    }
  }

  async function changeStatus(status: string) {
    await patch({ status });
  }

  async function changeDueDate(value: string) {
    await patch({ dueDate: value || null });
  }

  async function changeAssignees(next: AssigneeInput[]) {
    await patch({ assignees: next });
    setAssigneeOpen(false);
  }

  async function remove() {
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onDeleted(task.id);
    else toast("Erro ao excluir a tarefa", "error");
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface-2 transition-colors",
        overdue ? "border-red-500/30" : "border-border",
        (saving || deleting) && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
        {isNew && (
          <span className="flex items-center gap-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-o2-green bg-o2-green/10 px-1.5 py-0.5 rounded">
            <Sparkles size={9} /> Nova
          </span>
        )}
        {overdue && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
            Atrasada
          </span>
        )}

        <span className="text-sm text-ink font-medium flex-1 min-w-[10rem]" title={task.description || undefined}>
          {task.title}
        </span>

        <select
          value={task.status}
          onChange={(e) => changeStatus(e.target.value)}
          disabled={saving}
          className="bg-surface border border-border rounded-md px-2 py-1 text-xs text-ink-mid focus:outline-none focus:border-o2-green/50"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>

        <input
          type="date"
          value={task.dueDate ? format(dueDateOnly(task.dueDate), "yyyy-MM-dd") : ""}
          onChange={(e) => changeDueDate(e.target.value)}
          disabled={saving}
          className="bg-surface border border-border rounded-md px-2 py-1 text-xs text-ink-mid focus:outline-none focus:border-o2-green/50"
        />

        <button
          type="button"
          onClick={() => setAssigneeOpen((v) => !v)}
          className="flex items-center gap-1.5 bg-surface border border-border rounded-md pl-1 pr-2 py-1 text-xs text-ink-mid hover:border-o2-green/40 transition-colors max-w-[11rem]"
          title={describeResponsibles(responsibles)}
        >
          {responsibles.length > 0 ? (
            <div className="flex -space-x-1.5 shrink-0">
              {responsibles.slice(0, 3).map((r, i) => (
                <UserAvatar key={r.id} name={r.name} image={r.image} size="sm" index={i} />
              ))}
            </div>
          ) : null}
          <span className="truncate">{responsibles.length > 0 ? describeResponsibles(responsibles) : "Sem responsável"}</span>
          <ChevronDown size={11} className={cn("shrink-0 transition-transform", assigneeOpen && "rotate-180")} />
        </button>

        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="shrink-0 text-ink-faint hover:text-red-400 transition-colors p-1"
          title="Excluir tarefa"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {assigneeOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-border/60 animate-slide-in-up">
          <AssigneePicker
            users={users}
            client={client}
            value={responsibles.map((r) => ({ id: r.id, part: r.part, contactName: r.contactName }))}
            onChange={changeAssignees}
            compact
          />
        </div>
      )}

      {task.meetingDate && (
        <p className="px-3 pb-2 -mt-1 text-[11px] text-ink-faint">
          Origem: {task.meetingTitle || "reunião"} ·{" "}
          {format(new Date(task.meetingDate), "dd/MM", { locale: ptBR })}
        </p>
      )}
    </div>
  );
}
