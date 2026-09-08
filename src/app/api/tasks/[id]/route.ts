import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { revalidateTag } from "next/cache";
import { recordTaskChanges } from "@/lib/activity";
import { notifyTaskCompleted } from "@/lib/slack";
import { isValidRecurrence, isValidTime, normalizeWeekdays } from "@/lib/recurrence";
import { spawnNextOccurrence } from "@/lib/task-recurrence";
import { brtNow } from "@/lib/utils";
import { normalizeAssignees, syncTaskAssignees } from "@/lib/task-assignees";

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
  assignees: { include: { user: { select: { id: true, name: true, image: true } } }, orderBy: { sortOrder: "asc" } },
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
    include: { assignee: { select: { id: true, name: true } }, assignees: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const squadUserIds = new Set((await db.user.findMany({ select: { id: true } })).map((u) => u.id));
  const assignees = normalizeAssignees(body.assignees, squadUserIds);
  if (!assignees.ok) return NextResponse.json({ error: assignees.error }, { status: 400 });

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

  // Entrega ("" = interna, "client" = O2 entrega pro cliente, "o2" = cliente entrega pra O2).
  // Faltava aqui: sem aceitar esse campo no PATCH não havia como atribuir a tarefa ao cliente
  // depois de criada — "responsável = Cliente" é assigneeId null + deliverTo "o2", e o segundo
  // ficava congelado no valor da criação.
  let deliverTo: string | null | undefined;
  if (body.deliverTo !== undefined) {
    if (!body.deliverTo) deliverTo = null;
    else if (body.deliverTo === "client" || body.deliverTo === "o2") deliverTo = body.deliverTo;
    else return NextResponse.json({ error: "Entrega inválida" }, { status: 400 });
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
      // com `assignees` na mão, quem manda no dono é o primeiro da lista
      ...(body.assignees !== undefined
        ? { assigneeId: assignees.ok ? assignees.principalUserId : null }
        : body.assigneeId !== undefined
        ? { assigneeId: body.assigneeId }
        : {}),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.dueTime !== undefined && { dueTime: body.dueTime || null }),
      ...(body.client !== undefined && { client: body.client }),
      // cliente como ÚNICO responsável continua sendo gravado do jeito antigo
      // (assigneeId null + deliverTo "o2") — ver task-assignees.ts
      ...(assignees.ok && !assignees.joint && assignees.clientOnly
        ? { deliverTo: "o2" }
        : deliverTo !== undefined
        ? { deliverTo }
        : {}),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(recurrence !== undefined && { recurrence }),
      ...(recurrenceWeekdays !== undefined && { recurrenceWeekdays }),
    },
    include: TASK_INCLUDE,
  });

  if (body.assignees !== undefined && assignees.ok) {
    await syncTaskAssignees(db, id, assignees);
  }

  // Status e partes andam juntos numa tarefa em conjunto: concluir a tarefa direto
  // (arrastar no Kanban, por exemplo) marca a parte de todo mundo, e reabrir desmarca.
  // Sem isso dava pra ter tarefa "concluída" com parte pendente e vice-versa.
  const jointNow = await db.taskAssignee.count({ where: { taskId: id } });
  if (jointNow > 0 && body.status !== undefined && body.status !== before.status) {
    if (body.status === "done") {
      await db.taskAssignee.updateMany({
        where: { taskId: id, done: false },
        data: { done: true, doneAt: new Date(), doneById: session.user.id },
      });
    } else if (before.status === "done") {
      await db.taskAssignee.updateMany({
        where: { taskId: id },
        data: { done: false, doneAt: null, doneById: null },
      });
    }
  }

  // histórico de mudanças
  const effectiveAssigneeId = body.assignees !== undefined ? assignees.principalUserId ?? null : body.assigneeId;
  let newAssigneeName: string | null = before.assignee?.name ?? null;
  if (effectiveAssigneeId !== undefined && effectiveAssigneeId !== before.assigneeId) {
    newAssigneeName = effectiveAssigneeId
      ? (await db.user.findUnique({ where: { id: effectiveAssigneeId }, select: { name: true } }))?.name ?? null
      : null;
  }
  await recordTaskChanges(
    id,
    before,
    { ...body, ...(effectiveAssigneeId !== undefined ? { assigneeId: effectiveAssigneeId } : {}) },
    session.user?.name ?? null,
    { before: before.assignee?.name ?? null, after: newAssigneeName }
  ).catch((e) => console.error("[activity]", e));

  // notifica o novo dono (se não foi ele mesmo que mudou) — participantes não recebem
  // aviso de propósito: a tarefa aparece no Kanban/lista deles, e a cobrança é do dono
  if (
    effectiveAssigneeId !== undefined &&
    effectiveAssigneeId &&
    effectiveAssigneeId !== before.assigneeId &&
    effectiveAssigneeId !== session.user?.id
  ) {
    await db.notification.create({
      data: {
        squadId: session.user.squadId,
        userId: effectiveAssigneeId,
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
  // relê depois de sincronizar responsáveis/partes — o `task` de cima foi montado antes
  // disso e devolveria a lista velha pra tela
  const fresh = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  return NextResponse.json(fresh ?? task);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const { id } = await params;
  // confirma que a tarefa é deste squad antes de mexer nas sugestões ligadas a ela
  // (RecapSuggestion/ExternalSuggestion são achadas por taskId, sem escopo próprio)
  const task = await db.task.findUnique({ where: { id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tarefa que nasceu de uma sugestão da IA volta pra "Excluídos" em /sugestoes-ia em vez
  // de sumir: sem isso a sugestão ficava "accepted"/"edited" com taskId zerado pelo SetNull
  // do banco, ou seja, fora do Kanban e fora de todas as abas — some pra sempre.
  await Promise.all([
    db.recapSuggestion.updateMany({ where: { taskId: id }, data: { status: "rejected", taskId: null } }),
    db.externalSuggestion.updateMany({ where: { taskId: id }, data: { status: "rejected", taskId: null } }),
  ]);

  await db.taskComment.deleteMany({ where: { taskId: id } });
  await db.task.delete({ where: { id } });
  revalidateTag("tasks", "max");
  return NextResponse.json({ ok: true });
}
