import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forSquad } from "@/lib/tenant-prisma";
import { revalidateTag } from "next/cache";
import { notifyTaskCompleted } from "@/lib/slack";
import { spawnNextOccurrence } from "@/lib/task-recurrence";
import { brtNow } from "@/lib/utils";

type Params = { params: Promise<{ id: string; aid: string }> };

// Marca/desmarca a parte de UM responsável numa tarefa em conjunto.
//
// A parte do cliente é marcada por alguém do squad (o cliente não tem conta) — por isso
// não exige que quem chama seja o dono da parte. Fica registrado quem marcou em doneById.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, aid } = await params;

  // TaskAssignee não tem squadId próprio (é filha de Task) — confirma o squad pelo pai
  const row = await prisma.taskAssignee.findUnique({
    where: { id: aid },
    include: {
      task: {
        select: {
          id: true, squadId: true, status: true, title: true, client: true, description: true, priority: true,
          assigneeId: true, createdById: true, dueDate: true, dueTime: true, deliverTo: true,
          recurrence: true, recurrenceWeekdays: true, recurrenceSpawned: true,
        },
      },
      user: { select: { name: true } },
    },
  });
  if (!row || row.taskId !== id || row.task.squadId !== session.user.squadId) {
    return NextResponse.json({ error: "Responsável não encontrado nessa tarefa" }, { status: 404 });
  }

  const body = await req.json();
  const done = Boolean(body.done);

  await prisma.taskAssignee.update({
    where: { id: aid },
    data: { done, doneAt: done ? new Date() : null, doneById: done ? session.user.id : null },
  });

  // A tarefa em conjunto só fecha quando todas as partes estiverem marcadas — e reabre
  // sozinha se alguém desmarcar a sua depois de fechada.
  const pending = await prisma.taskAssignee.count({ where: { taskId: id, done: false } });
  const shouldBeDone = pending === 0;
  const db = forSquad(session.user.squadId);
  let statusChanged: string | null = null;

  if (shouldBeDone && row.task.status !== "done") {
    await db.task.update({ where: { id }, data: { status: "done" } });
    statusChanged = "done";
  } else if (!shouldBeDone && row.task.status === "done") {
    await db.task.update({ where: { id }, data: { status: "in_progress" } });
    statusChanged = "in_progress";
  }

  const whoseName = row.isClient ? row.task.client || "Cliente" : row.user?.name ?? "alguém";
  await prisma.taskActivity.create({
    data: {
      taskId: id,
      userName: session.user.name ?? null,
      type: "part",
      detail: done ? `Parte de ${whoseName} concluída` : `Parte de ${whoseName} reaberta`,
    },
  }).catch((e) => console.error("[activity]", e));

  if (statusChanged === "done") {
    await prisma.taskActivity.create({
      data: { taskId: id, userName: null, type: "status", detail: "Todas as partes concluídas → tarefa concluída" },
    }).catch((e) => console.error("[activity]", e));

    await notifyTaskCompleted({
      squadId: session.user.squadId,
      userDbId: session.user.id,
      taskTitle: row.task.title,
      client: row.task.client,
    }).catch((e) => console.error("[slack]", e));

    // Fechar pela última parte é uma conclusão como qualquer outra: a série recorrente
    // precisa gerar a próxima ocorrência aqui também, senão a rotina morre calada quando
    // o time conclui marcando as partes em vez de arrastar no Kanban.
    if (row.task.recurrence && !row.task.recurrenceSpawned) {
      await spawnNextOccurrence(row.task, brtNow().today).catch((e) => console.error("[recurrence]", e));
    }
  }

  // Avisa o DONO que uma parte andou (a decisão foi: aviso só pro dono). Não avisa quando
  // é o próprio dono marcando, nem quando ele já vai receber o aviso de tarefa concluída.
  const principal = await prisma.taskAssignee.findFirst({
    where: { taskId: id, role: "principal" },
    select: { userId: true },
  });
  if (done && principal?.userId && principal.userId !== session.user.id && statusChanged !== "done") {
    await db.notification.create({
      data: {
        squadId: session.user.squadId,
        userId: principal.userId,
        type: "assigned",
        message: `${session.user.name?.split(" ")[0] ?? "Alguém"} concluiu a parte de ${whoseName} em: ${row.task.title}`,
        link: `/tasks?task=${id}`,
      },
    }).catch((e) => console.error("[notification]", e));
  }

  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      assignees: { include: { user: { select: { id: true, name: true, image: true } } }, orderBy: { sortOrder: "asc" } },
      subtasks: { select: { id: true, done: true } },
      _count: { select: { links: true, comments: true } },
    },
  });

  revalidateTag("tasks", "max");
  return NextResponse.json(task);
}
