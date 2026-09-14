import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { knownClientNames } from "@/lib/client-resolve";

const WINDOW_DAYS = 7;

// include igual ao de GET /api/tasks — a revisão semanal reaproveita o mesmo formato
// de tarefa (TaskListItem) pra poder usar AssigneePicker e os mesmos componentes.
const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
  assignees: { include: { user: { select: { id: true, name: true, image: true } } }, orderBy: { sortOrder: "asc" } },
  subtasks: { select: { id: true, done: true } },
  _count: { select: { links: true, comments: true } },
} as const;

type ClientBucket = {
  name: string;
  health: string | null;
  oxyStage: string | null;
  meetings: { id: string; title: string; startAt: string; meetingType: string | null; temperature: string | null }[];
  suggestions: {
    id: string;
    kind: "recap" | "external";
    title: string;
    description: string | null;
    priority: string | null;
    dueDate: string | null;
    sourceLabel: string;
    // dados que a criação da tarefa (POST /api/tasks) precisa pra marcar a origem certa
    sourceRef: string | null;
    meetingTitle: string | null;
    meetingDate: string | null;
  }[];
  tasksCompleted: { id: string; title: string; updatedAt: string }[];
  tasksOpen: (Record<string, unknown> & { id: string; isNew: boolean })[];
};

// Revisão semanal (showroom da sexta-feira): pra cada cliente da carteira, junta o que
// aconteceu nos últimos 7 dias corridos (reuniões, tarefas criadas/concluídas, sugestões
// pendentes) + TODAS as tarefas em aberto (não só as da semana — o backlog inteiro é
// revisado toda semana, não só o que é novo). "Cliente" não é entidade própria, é uma
// string replicada em Task/CalendarEvent/MeetRecap/etc — daí o agrupamento em memória
// em vez de um JOIN.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [names, notes, meetings, recapSuggestions, externalSuggestions, completedActivity, tasksOpen, users] =
    await Promise.all([
      knownClientNames(db, session.user.squadId),
      db.clientNote.findMany({ select: { client: true, healthStatus: true, oxyStage: true } }),
      db.calendarEvent.findMany({
        where: { startAt: { gte: windowStart, lte: now } },
        select: { id: true, title: true, client: true, startAt: true, meetingType: true, temperature: true },
        orderBy: { startAt: "asc" },
      }),
      db.recapSuggestion.findMany({
        where: { status: "pending" },
        select: {
          id: true, title: true, description: true, priority: true, dueDate: true, createdAt: true,
          recap: { select: { id: true, client: true, subject: true, createdAt: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.externalSuggestion.findMany({
        where: { status: "pending" },
        select: {
          id: true, title: true, description: true, priority: true, dueDate: true, client: true, source: true,
          sourceRef: true, meetingTitle: true, meetingDate: true, createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.taskActivity.findMany({
        where: { type: "status", createdAt: { gte: windowStart }, detail: { contains: "onclu", mode: "insensitive" } },
        select: { taskId: true, createdAt: true, task: { select: { id: true, title: true, client: true, updatedAt: true, status: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.task.findMany({
        where: { status: { not: "done" }, client: { not: null } },
        include: TASK_INCLUDE,
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, image: true } }),
    ]);

  const buckets = new Map<string, ClientBucket>();
  function bucketFor(name: string | null | undefined): ClientBucket | null {
    if (!name) return null;
    let b = buckets.get(name);
    if (!b) {
      b = { name, health: null, oxyStage: null, meetings: [], suggestions: [], tasksCompleted: [], tasksOpen: [] };
      buckets.set(name, b);
    }
    return b;
  }

  // seeds — TODOS os clientes da carteira aparecem, mesmo sem nada essa semana
  for (const name of names) bucketFor(name);

  for (const note of notes) {
    const b = bucketFor(note.client);
    if (b) { b.health = note.healthStatus; b.oxyStage = note.oxyStage; }
  }

  for (const m of meetings) {
    const b = bucketFor(m.client);
    if (b) b.meetings.push({ id: m.id, title: m.title, startAt: m.startAt.toISOString(), meetingType: m.meetingType, temperature: m.temperature });
  }

  for (const s of recapSuggestions) {
    const b = bucketFor(s.recap.client);
    if (b) {
      b.suggestions.push({
        id: s.id, kind: "recap", title: s.title, description: s.description, priority: s.priority,
        dueDate: s.dueDate ? s.dueDate.toISOString() : null,
        sourceLabel: `Meet Recap: ${s.recap.subject}`,
        sourceRef: s.recap.id, meetingTitle: s.recap.subject, meetingDate: s.recap.createdAt.toISOString(),
      });
    }
  }
  for (const s of externalSuggestions) {
    const b = bucketFor(s.client);
    if (b) {
      b.suggestions.push({
        id: s.id, kind: "external", title: s.title, description: s.description, priority: s.priority,
        dueDate: s.dueDate ? s.dueDate.toISOString() : null,
        sourceLabel: s.source === "n8n" ? "Automação (n8n)" : s.source,
        sourceRef: s.sourceRef, meetingTitle: s.meetingTitle,
        meetingDate: s.meetingDate ? s.meetingDate.toISOString() : null,
      });
    }
  }

  const seenCompletedTaskIds = new Set<string>();
  for (const a of completedActivity) {
    if (!a.task || a.task.status !== "done" || seenCompletedTaskIds.has(a.task.id)) continue;
    const b = bucketFor(a.task.client);
    if (b) {
      seenCompletedTaskIds.add(a.task.id);
      b.tasksCompleted.push({ id: a.task.id, title: a.task.title, updatedAt: a.task.updatedAt.toISOString() });
    }
  }

  for (const t of tasksOpen) {
    const b = bucketFor(t.client);
    if (b) b.tasksOpen.push({ ...t, isNew: t.createdAt >= windowStart });
  }

  const clients = [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return NextResponse.json({ windowStart: windowStart.toISOString(), windowDays: WINDOW_DAYS, clients, users });
}
