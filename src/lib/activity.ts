import { prisma } from "./prisma";
import { statusLabel, priorityLabel } from "./utils";

type TaskSnapshot = {
  status: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  assigneeId: string | null;
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
