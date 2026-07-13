import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { recordTaskChanges } from "@/lib/activity";
import { notifyTaskCompleted } from "@/lib/slack";

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
  subtasks: { select: { id: true, done: true } },
  _count: { select: { links: true, comments: true } },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

function nextDueDate(current: Date | null, recurrence: string): Date | null {
  const base = current ?? new Date();
  const next = new Date(base);
  if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "biweekly") next.setDate(next.getDate() + 14);
  else if (recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  else return null;
  return next;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const before = await prisma.task.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true } } },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.priority && { priority: body.priority }),
      ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.client !== undefined && { client: body.client }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(body.recurrence !== undefined && { recurrence: body.recurrence }),
    },
    include: TASK_INCLUDE,
  });

  // histórico de mudanças
  let newAssigneeName: string | null = before.assignee?.name ?? null;
  if (body.assigneeId !== undefined && body.assigneeId !== before.assigneeId) {
    newAssigneeName = body.assigneeId
      ? (await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { name: true } }))?.name ?? null
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
    await prisma.notification.create({
      data: {
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
      userDbId: session.user.id,
      taskTitle: task.title,
      client: task.client,
    }).catch((e) => console.error("[slack]", e));
  }

  // recorrência: ao concluir, cria a próxima ocorrência
  if (body.status === "done" && before.status !== "done" && before.recurrence) {
    const due = nextDueDate(before.dueDate, before.recurrence);
    if (due) {
      await prisma.task.create({
        data: {
          title: before.title,
          description: before.description,
          priority: before.priority,
          assigneeId: before.assigneeId,
          createdById: before.createdById,
          dueDate: due,
          source: "recurrence",
          client: before.client,
          deliverTo: before.deliverTo,
          recurrence: before.recurrence,
        },
      }).catch((e) => console.error("[recurrence]", e));
    }
  }

  revalidateTag("tasks", "max");
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.taskComment.deleteMany({ where: { taskId: id } });
  await prisma.task.delete({ where: { id } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
