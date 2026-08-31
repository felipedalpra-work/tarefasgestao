import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { revalidateTag } from "next/cache";
import { recordTaskChanges } from "@/lib/activity";
import { notifyTaskCompleted } from "@/lib/slack";
import { isValidRecurrence, isValidTime, normalizeWeekdays } from "@/lib/recurrence";
import { spawnNextOccurrence } from "@/lib/task-recurrence";
import { brtNow } from "@/lib/utils";

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
  subtasks: { select: { id: true, done: true } },
  _count: { select: { links: true, comments: true } },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const task = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  const body = await req.json();

  const before = await db.task.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true } } },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // "" (Nenhuma) vira null; valor desconhecido é rejeitado em vez de virar null
  // silenciosamente, senão um typo mataria a série sem ninguém perceber
  let recurrence: string | null | undefined;
  if (body.recurrence !== undefined) {
    if (!body.recurrence) recurrence = null;
    else if (isValidRecurrence(body.recurrence)) recurrence = body.recurrence;
    else return NextResponse.json({ error: "Recorrência inválida" }, { status: 400 });
  }
  if (body.dueTime !== undefined && body.dueTime && !isValidTime(body.dueTime)) {
    return NextResponse.json({ error: "Horário inválido (use HH:MM)" }, { status: 400 });
  }
  const effectiveRecurrence = recurrence !== undefined ? recurrence : before.recurrence;
  let recurrenceWeekdays: number[] | undefined;
  if (body.recurrenceWeekdays !== undefined || recurrence !== undefined) {
    recurrenceWeekdays =
      effectiveRecurrence === "weekdays"
        ? normalizeWeekdays(body.recurrenceWeekdays ?? before.recurrenceWeekdays)
        : [];
    if (effectiveRecurrence === "weekdays" && recurrenceWeekdays.length === 0) {
      return NextResponse.json({ error: "Escolha pelo menos um dia da semana" }, { status: 400 });
    }
  }

  const task = await db.task.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.priority && { priority: body.priority }),
      ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.dueTime !== undefined && { dueTime: body.dueTime || null }),
      ...(body.client !== undefined && { client: body.client }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(recurrence !== undefined && { recurrence }),
      ...(recurrenceWeekdays !== undefined && { recurrenceWeekdays }),
    },
    include: TASK_INCLUDE,
  });

  // histórico de mudanças
  let newAssigneeName: string | null = before.assignee?.name ?? null;
  if (body.assigneeId !== undefined && body.assigneeId !== before.assigneeId) {
    newAssigneeName = body.assigneeId
      ? (await db.user.findUnique({ where: { id: body.assigneeId }, select: { name: true } }))?.name ?? null
      : null;
  }
  await recordTaskChanges(
    id,
    before,
    body,
    session.user?.name ?? null,
    { before: before.assignee?.name ?? null, after: newAssigneeName }
  ).catch((e) => console.error("[activity]", e));

  // notifica novo responsável (se não foi ele mesmo que mudou)
  if (
    body.assigneeId !== undefined &&
    body.assigneeId &&
    body.assigneeId !== before.assigneeId &&
    body.assigneeId !== session.user?.id
  ) {
    await db.notification.create({
      data: {
        squadId: session.user.squadId,
        userId: body.assigneeId,
        type: "assigned",
        message: `${session.user?.name?.split(" ")[0] ?? "Alguém"} atribuiu a você: ${task.title}`,
        link: `/tasks?task=${task.id}`,
      },
    }).catch((e) => console.error("[notification]", e));
  }

  // parabeniza no Slack quem concluiu a tarefa
  if (body.status === "done" && before.status !== "done" && session.user?.id) {
    await notifyTaskCompleted({
      squadId: session.user.squadId,
      userDbId: session.user.id,
      taskTitle: task.title,
      client: task.client,
    }).catch((e) => console.error("[slack]", e));
  }

  // Recorrência: ao concluir, cria a próxima ocorrência. O `recurrenceSpawned` do
  // before é o que evita duplicar — sem ele, concluir → reabrir → concluir criava
  // duas ocorrências, e o cron (que mantém a série viva mesmo sem ninguém concluir)
  // criaria uma terceira. Quem gera de fato é spawnNextOccurrence.
  if (body.status === "done" && before.status !== "done" && before.recurrence && !before.recurrenceSpawned) {
    await spawnNextOccurrence(
      { ...before, recurrence: recurrence !== undefined ? recurrence : before.recurrence },
      brtNow().today
    ).catch((e) => console.error("[recurrence]", e));
  }

  revalidateTag("tasks", "max");
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  await db.taskComment.deleteMany({ where: { taskId: id } });
  await db.task.delete({ where: { id } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
