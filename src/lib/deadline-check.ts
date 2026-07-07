import { prisma } from "./prisma";
import { sendDeadlineAlertEmail } from "./email";

export async function checkDeadlines(): Promise<number> {
  const now = new Date();
  const in2days = new Date(now);
  in2days.setDate(in2days.getDate() + 2);
  in2days.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
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

  console.log(`[deadline] ${tasks.length} tarefa(s) verificada(s), ${sent} email(s) enviado(s)`);
  return sent;
}
