import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { sendDeadlineAlertEmail } from "./email";
import { createClientTaskDraft } from "./gmail-draft";

async function checkDeadlinesForSquad(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const now = new Date();
  const in2days = new Date(now);
  in2days.setDate(in2days.getDate() + 2);
  in2days.setHours(23, 59, 59, 999);

  const tasks = await db.task.findMany({
    where: {
      status: { notIn: ["done"] },
      dueDate: { not: null, lte: in2days },
    },
    include: {
      assignee: { select: { name: true, email: true } },
    },
  });

  let sent = 0;
  for (const task of tasks) {
    if (!task.assignee?.email || !task.dueDate) continue;

    const diffMs = new Date(task.dueDate).getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    try {
      await sendDeadlineAlertEmail({
        to: task.assignee.email,
        assigneeName: task.assignee.name || task.assignee.email,
        taskTitle: task.title,
        dueDate: task.dueDate,
        daysLeft,
      });
      sent++;
      console.log(`[deadline] email enviado: "${task.title}" → ${task.assignee.email} (${daysLeft}d)`);
    } catch (err) {
      console.error(`[deadline] erro ao enviar para ${task.assignee.email}:`, err);
    }
  }

  console.log(`[deadline] squad ${squadId}: ${tasks.length} tarefa(s) verificada(s), ${sent} email(s) enviado(s)`);
  return sent;
}

// Sem squadId: roda em todos os squads (uso do cron). Com squadId: só aquele squad
// (uso do botão manual — sem isso, qualquer membro de qualquer squad dispararia
// alerta de prazo pra tarefa de outro squad).
export async function checkDeadlines(squadId?: string): Promise<number> {
  if (squadId) return checkDeadlinesForSquad(squadId);
  const squads = await prisma.squad.findMany({ select: { id: true } });
  let total = 0;
  for (const { id } of squads) total += await checkDeadlinesForSquad(id);
  return total;
}

// Tarefas atribuídas ao cliente (assigneeId null + deliverTo "o2") ficam de fora do
// checkDeadlines acima (que só olha task.assignee) — sem isso, uma pendência do
// cliente vencida nunca gera nenhum alerta pra ninguém. Aqui a gente cria um
// rascunho de cobrança (uma única vez por tarefa, via clientDraftCreatedAt) em vez
// de mandar e-mail direto — ver src/lib/gmail-draft.ts.
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
