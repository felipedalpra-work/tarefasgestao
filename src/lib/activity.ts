import { prisma } from "./prisma";
import { statusLabel, priorityLabel } from "./utils";
import { describeRecurrence, normalizeWeekdays } from "./recurrence";

type TaskSnapshot = {
  status: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  dueTime: string | null;
  assigneeId: string | null;
  recurrence: string | null;
  recurrenceWeekdays: number[];
};

// Compara o estado anterior com o body do PATCH e registra as mudanças
export async function recordTaskChanges(
  taskId: string,
  before: TaskSnapshot,
  body: Record<string, unknown>,
  userName: string | null,
  assigneeNames: { before: string | null; after: string | null }
): Promise<void> {
  const entries: { type: string; detail: string }[] = [];

  if (body.status && body.status !== before.status) {
    entries.push({ type: "status", detail: `${statusLabel(before.status)} → ${statusLabel(String(body.status))}` });
  }
  if (body.title && body.title !== before.title) {
    entries.push({ type: "title", detail: `Título alterado para "${body.title}"` });
  }
  if (body.priority && body.priority !== before.priority) {
    entries.push({ type: "priority", detail: `${priorityLabel(before.priority)} → ${priorityLabel(String(body.priority))}` });
  }
  if (body.dueDate !== undefined) {
    const newDue = body.dueDate ? new Date(String(body.dueDate)) : null;
    const oldDue = before.dueDate ? new Date(before.dueDate) : null;
    if ((newDue?.getTime() ?? null) !== (oldDue?.getTime() ?? null)) {
      const fmt = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR") : "sem prazo");
      entries.push({ type: "due_date", detail: `${fmt(oldDue)} → ${fmt(newDue)}` });
    }
  }
  if (body.dueTime !== undefined) {
    const newTime = body.dueTime ? String(body.dueTime) : null;
    if (newTime !== before.dueTime) {
      entries.push({ type: "due_date", detail: `Horário: ${before.dueTime ?? "sem horário"} → ${newTime ?? "sem horário"}` });
    }
  }
  // recorrência e dias da semana viram uma linha só: mudar de "toda terça" pra
  // "terça e sexta" é uma mudança, não duas
  if (body.recurrence !== undefined || body.recurrenceWeekdays !== undefined) {
    const newRecurrence = body.recurrence !== undefined ? (body.recurrence ? String(body.recurrence) : null) : before.recurrence;
    const newWeekdays =
      body.recurrenceWeekdays !== undefined ? normalizeWeekdays(body.recurrenceWeekdays) : before.recurrenceWeekdays;
    const oldLabel = describeRecurrence(before.recurrence, before.recurrenceWeekdays) || "sem recorrência";
    const newLabel = describeRecurrence(newRecurrence, newWeekdays) || "sem recorrência";
    if (oldLabel !== newLabel) {
      entries.push({ type: "recurrence", detail: `${oldLabel} → ${newLabel}` });
    }
  }
  if (body.assigneeId !== undefined && body.assigneeId !== before.assigneeId) {
    entries.push({
      type: "assignee",
      detail: `${assigneeNames.before ?? "sem responsável"} → ${assigneeNames.after ?? "sem responsável"}`,
    });
  }

  if (entries.length === 0) return;
  await prisma.taskActivity.createMany({
    data: entries.map((e) => ({ taskId, userName, ...e })),
  });
}
