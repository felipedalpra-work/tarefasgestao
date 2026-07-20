import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { sendNewTaskEmail } from "@/lib/email";
import { notifyTaskAssigned } from "@/lib/slack";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      subtasks: { select: { id: true, done: true } },
      _count: { select: { links: true, comments: true } },
    },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(tasks, {
    headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description || null,
      priority: body.priority || "medium",
      assigneeId: body.assigneeId || session.user.id,
      createdById: session.user.id,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      source: body.source || "manual",
      sourceRef: body.sourceRef || null,
      client: body.client || null,
      deliverTo: body.deliverTo || null,
      recurrence: body.recurrence || null,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { name: true } },
    },
  });

  await prisma.taskActivity.create({
    data: {
      taskId: task.id,
      userName: session.user.name ?? null,
      type: "created",
      detail:
        task.source === "meet_recap"
          ? "Criada a partir de um Meet Recap"
          : task.source === "n8n"
          ? "Criada a partir do workflow n8n"
          : "Tarefa criada",
    },
  });

  if (body.recapSuggestionId) {
    await prisma.recapSuggestion.update({
      where: { id: body.recapSuggestionId },
      data: { status: body.suggestionEdited ? "edited" : "accepted", taskId: task.id },
    }).catch((e) => console.error("[recap-suggestion] erro ao vincular:", e));
  }

  if (body.externalSuggestionId) {
    await prisma.externalSuggestion.update({
      where: { id: body.externalSuggestionId },
      data: { status: body.suggestionEdited ? "edited" : "accepted", taskId: task.id },
    }).catch((e) => console.error("[external-suggestion] erro ao vincular:", e));
  }

  // notificação in-app quando atribuída a outra pessoa
  if (task.assigneeId && task.assigneeId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: task.assigneeId,
        type: "assigned",
        message: `${session.user.name?.split(" ")[0] ?? "Alguém"} atribuiu a você: ${task.title}`,
        link: `/tasks?task=${task.id}`,
      },
    }).catch((e) => console.error("[notification]", e));
  }

  revalidateTag("tasks", "max");

  if (task.assignee?.email && task.assigneeId !== session.user.id) {
    sendNewTaskEmail({
      to: task.assignee.email,
      assigneeName: task.assignee.name || task.assignee.email,
      taskTitle: task.title,
      taskDescription: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      createdBy: task.createdBy?.name || "Alguém do squad",
    }).catch((e) => console.error("[email] erro ao enviar:", e));
  }

  if (task.assigneeId) {
    notifyTaskAssigned({
      assigneeDbId: task.assigneeId,
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      createdBy: task.createdBy?.name || null,
      client: task.client,
    }).catch((e) => console.error("[slack] erro ao notificar:", e));
  }

  return NextResponse.json(task, { status: 201 });
}
