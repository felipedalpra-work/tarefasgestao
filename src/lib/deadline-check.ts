import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { createClientTaskDraft } from "./gmail-draft";

// Tarefas atribuídas ao cliente (assigneeId null + deliverTo "o2") — cria um rascunho
// de cobrança (uma única vez por tarefa, via clientDraftCreatedAt) em vez de mandar
// e-mail direto — ver src/lib/gmail-draft.ts.
async function checkClientTasksOverdueForSquad(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const tasks = await db.task.findMany({
    where: {
      assigneeId: null,
      deliverTo: "o2",
      status: { not: "done" },
      dueDate: { not: null, lt: new Date() },
      clientDraftCreatedAt: null,
    },
  });

  let created = 0;
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const ok = await createClientTaskDraft(squadId, {
      title: task.title,
      description: task.description,
      client: task.client,
      dueDate: task.dueDate,
      meetingTitle: task.meetingTitle,
      meetingDate: task.meetingDate,
    });
    if (ok) {
      await db.task.update({ where: { id: task.id }, data: { clientDraftCreatedAt: new Date() } });
      created++;
    }
  }

  console.log(`[deadline] squad ${squadId}: ${tasks.length} tarefa(s) do cliente vencida(s), ${created} rascunho(s) criado(s)`);
  return created;
}

export async function checkClientTasksOverdue(squadId?: string): Promise<number> {
  if (squadId) return checkClientTasksOverdueForSquad(squadId);
  const squads = await prisma.squad.findMany({ select: { id: true } });
  let total = 0;
  for (const { id } of squads) total += await checkClientTasksOverdueForSquad(id);
  return total;
}
