import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { revalidateTag } from "next/cache";
import { sendNewTaskEmail } from "@/lib/email";
import { notifyTaskAssigned } from "@/lib/slack";
import { firstOccurrence, isValidRecurrence, isValidTime, normalizeWeekdays } from "@/lib/recurrence";
import { brtNow } from "@/lib/utils";
import { normalizeAssignees, syncTaskAssignees } from "@/lib/task-assignees";

// include padrão de tarefa — assignees junto, senão a UI não sabe que é em conjunto
const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
  assignees: { include: { user: { select: { id: true, name: true, image: true } } }, orderBy: { sortOrder: "asc" } },
  subtasks: { select: { id: true, done: true } },
  _count: { select: { links: true, comments: true } },
} as const;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const tasks = await db.task.findMany({
    include: TASK_INCLUDE,
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(tasks, {
    headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const body = await req.json();

  const recurrence = isValidRecurrence(body.recurrence) ? body.recurrence : null;
  const recurrenceWeekdays = recurrence === "weekdays" ? normalizeWeekdays(body.recurrenceWeekdays) : [];
  if (recurrence === "weekdays" && recurrenceWeekdays.length === 0) {
    return NextResponse.json({ error: "Escolha pelo menos um dia da semana" }, { status: 400 });
  }
  if (body.dueTime && !isValidTime(body.dueTime)) {
    return NextResponse.json({ error: "Horário inválido (use HH:MM)" }, { status: 400 });
  }

  // Responsáveis: `assignees` (lista, o primeiro é o dono) é o caminho novo; sem ele,
  // segue valendo assigneeId/noAssignee de sempre.
  const squadUserIds = new Set((await db.user.findMany({ select: { id: true } })).map((u) => u.id));
  const assignees = normalizeAssignees(body.assignees, squadUserIds);
  if (!assignees.ok) return NextResponse.json({ error: assignees.error }, { status: 400 });

  // Série com recorrência mas sem prazo nunca geraria a próxima ocorrência nem
  // dispararia lembrete — ancora na primeira data válida a partir de hoje.
  const explicitDue = body.dueDate ? new Date(body.dueDate) : null;
  const dueDate = explicitDue ?? (recurrence ? firstOccurrence(recurrence, recurrenceWeekdays, brtNow().today) : null);

  const task = await db.task.create({
    data: {
      squadId: session.user.squadId,
      title: body.title,
      description: body.description || null,
      priority: body.priority || "medium",
      // noAssignee: true = intencionalmente sem responsável (ex: tarefa atribuída ao cliente,
      // via deliverTo), não cai no padrão de "quem clicou criou/aceitou"
      assigneeId: assignees.joint
        ? assignees.principalUserId
        : body.assignees !== undefined
        ? assignees.principalUserId
        : body.noAssignee
        ? null
        : body.assigneeId || session.user.id,
      createdById: session.user.id,
      dueDate,
      dueTime: body.dueTime || null,
      source: body.source || "manual",
      sourceRef: body.sourceRef || null,
      client: body.client || null,
      // cliente como ÚNICO responsável continua sendo gravado do jeito antigo
      // (assigneeId null + deliverTo "o2") — ver task-assignees.ts
      deliverTo: assignees.ok && !assignees.joint && assignees.clientOnly ? "o2" : body.deliverTo || null,
      clientContactName: assignees.ok && !assignees.joint && assignees.clientOnly ? assignees.clientContactName : null,
      meetingTitle: body.meetingTitle || null,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
      recurrence,
      recurrenceWeekdays,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (assignees.ok && assignees.joint) {
    await syncTaskAssignees(db, task.id, assignees);
  }

  await db.taskActivity.create({
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
    await db.recapSuggestion.update({
      where: { id: body.recapSuggestionId },
      data: { status: body.suggestionEdited ? "edited" : "accepted", taskId: task.id },
    }).catch((e) => console.error("[recap-suggestion] erro ao vincular:", e));
  }

  if (body.externalSuggestionId) {
    await db.externalSuggestion.update({
      where: { id: body.externalSuggestionId },
      data: { status: body.suggestionEdited ? "edited" : "accepted", taskId: task.id },
    }).catch((e) => console.error("[external-suggestion] erro ao vincular:", e));
  }

  // notificação in-app quando atribuída a outra pessoa
  if (task.assigneeId && task.assigneeId !== session.user.id) {
    await db.notification.create({
      data: {
        squadId: session.user.squadId,
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
      squadId: session.user.squadId,
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

  const created = await db.task.findUnique({ where: { id: task.id }, include: TASK_INCLUDE });
  return NextResponse.json(created ?? task, { status: 201 });
}
