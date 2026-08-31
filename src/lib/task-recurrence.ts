import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { brtNow } from "./utils";
import { nextOccurrence } from "./recurrence";

// Campos que a próxima ocorrência herda da anterior. `status`, `sortOrder`,
// comentários e subtarefas ficam de fora de propósito: cada ocorrência começa
// do zero (é uma rodada nova da rotina, não uma cópia do histórico).
type Occurrence = {
  id: string;
  squadId: string;
  title: string;
  description: string | null;
  priority: string;
  assigneeId: string | null;
  createdById: string;
  dueDate: Date | null;
  dueTime: string | null;
  client: string | null;
  deliverTo: string | null;
  recurrence: string | null;
  recurrenceWeekdays: number[];
};

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

// Cria a ocorrência seguinte de uma tarefa recorrente e marca a atual como já
// "gerada", pra série nunca duplicar (o flag é o que garante idempotência: o cron
// roda a cada 5 min e a conclusão também dispara isso).
//
// A âncora é a data mais recente entre o prazo da ocorrência atual e hoje: concluir
// adiantado mantém o ritmo da série (terça → sexta), e uma tarefa esquecida há meses
// não gera um monte de ocorrência no passado.
export async function spawnNextOccurrence(task: Occurrence, today: Date): Promise<Date | null> {
  const anchor = laterOf(task.dueDate ?? today, today);
  const due = nextOccurrence(task.recurrence, task.recurrenceWeekdays, anchor);
  if (!due) return null;

  const db = forSquad(task.squadId);
  await db.$transaction([
    db.task.create({
      data: {
        squadId: task.squadId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assigneeId: task.assigneeId,
        createdById: task.createdById,
        dueDate: due,
        dueTime: task.dueTime,
        source: "recurrence",
        client: task.client,
        deliverTo: task.deliverTo,
        recurrence: task.recurrence,
        recurrenceWeekdays: task.recurrenceWeekdays,
      },
    }),
    db.task.update({ where: { id: task.id }, data: { recurrenceSpawned: true } }),
  ]);
  return due;
}

// Mantém as séries vivas sem depender de ninguém concluir nada. Antes, a próxima
// ocorrência só nascia ao marcar "concluída" — quem esquecia de fazer a importação
// da terça ficava sem a da sexta, e a rotina morria silenciosamente.
export async function advanceRecurringTasksForSquad(squadId: string): Promise<number> {
  const db = forSquad(squadId);
  const { today } = brtNow();

  const pending = await db.task.findMany({
    where: {
      recurrence: { not: null },
      recurrenceSpawned: false,
      dueDate: { not: null, lt: today }, // o dia dessa ocorrência já passou
    },
    select: {
      id: true, squadId: true, title: true, description: true, priority: true,
      assigneeId: true, createdById: true, dueDate: true, dueTime: true,
      client: true, deliverTo: true, recurrence: true, recurrenceWeekdays: true,
    },
  });

  let created = 0;
  for (const task of pending) {
    const due = await spawnNextOccurrence(task, today).catch((e) => {
      console.error(`[recurrence] erro ao gerar próxima de "${task.title}":`, e);
      return null;
    });
    if (due) created++;
  }

  if (created > 0) console.log(`[recurrence] squad ${squadId}: ${created} ocorrência(s) criada(s)`);
  return created;
}

export async function advanceRecurringTasks(squadId?: string): Promise<number> {
  if (squadId) return advanceRecurringTasksForSquad(squadId);
  const squads = await prisma.squad.findMany({ select: { id: true } });
  let total = 0;
  for (const { id } of squads) total += await advanceRecurringTasksForSquad(id);
  return total;
}
