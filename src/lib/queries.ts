import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// Cached: lista de usuários (muda raramente)
export const getUsers = unstable_cache(
  async () =>
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, image: true, cargo: true },
    }),
  ["users"],
  { tags: ["users"], revalidate: 300 } // 5 min
);

// Cached: todas as tasks (invalida em mutações)
export const getAllTasks = unstable_cache(
  async () =>
    prisma.task.findMany({
      include: { assignee: { select: { id: true, name: true, image: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
  ["tasks-all"],
  { tags: ["tasks"], revalidate: 10 }
);

// Cached: tasks de um usuário específico
export const getTasksByUser = unstable_cache(
  async (userId: string) =>
    prisma.task.findMany({
      where: { assigneeId: userId },
      include: { assignee: { select: { id: true, name: true, image: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ["tasks-user"],
  { tags: ["tasks"], revalidate: 10 }
);

// Cached: recaps (invalida ao sincronizar)
export const getRecaps = unstable_cache(
  async () =>
    prisma.meetRecap.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        createdAt: true,
        processedAt: true,
        suggestedTasks: true,
        client: true,
      },
    }),
  ["recaps"],
  { tags: ["recaps"], revalidate: 30 }
);

// Cached: eventos de calendário por mês
export const getCalendarEvents = unstable_cache(
  async (year: number, month: number) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return prisma.calendarEvent.findMany({
      where: { startAt: { gte: start, lte: end } },
      orderBy: { startAt: "asc" },
    });
  },
  ["calendar-events"],
  { tags: ["calendar"], revalidate: 120 }
);

// Cached: visão geral de clientes (card list)
export const getClientsOverview = unstable_cache(
  async () => {
    const [events, recaps, tasks] = await Promise.all([
      prisma.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } } }),
      prisma.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } } }),
      prisma.task.findMany({ select: { client: true, status: true }, where: { client: { not: null } } }),
    ]);

    const map: Record<string, { meetings: number; recaps: number; tasks: number; openTasks: number }> = {};
    const ensure = (c: string) => { if (!map[c]) map[c] = { meetings: 0, recaps: 0, tasks: 0, openTasks: 0 }; };

    events.forEach((e) => { if (e.client) { ensure(e.client); map[e.client].meetings++; } });
    recaps.forEach((r) => { if (r.client) { ensure(r.client); map[r.client].recaps++; } });
    tasks.forEach((t) => {
      if (t.client) {
        ensure(t.client);
        map[t.client].tasks++;
        if (t.status !== "done") map[t.client].openTasks++;
      }
    });

    return Object.entries(map)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  ["clients-overview"],
  { tags: ["calendar", "recaps", "tasks"], revalidate: 60 }
);

// Cached: clientes com status geral + situação na Oxy, para a tabela de clientes
export const getClientsTable = unstable_cache(
  async () => {
    const [overview, notes] = await Promise.all([
      getClientsOverview(),
      prisma.clientNote.findMany({
        select: {
          client: true,
          status: true,
          oxyStage: true,
          importType: true,
          lastDataUpdate: true,
          oxyPendencies: true,
          erp: true,
          healthStatus: true,
        },
      }),
    ]);

    const overviewByClient = new Map(overview.map((c) => [c.name, c]));
    const notesByClient = new Map(notes.map((n) => [n.client, n]));

    // a carteira de clientes (ClientNote) é a fonte de verdade de quais clientes existem;
    // reuniões/recaps/tarefas só complementam com estatísticas quando houver
    const allNames = new Set([...overviewByClient.keys(), ...notesByClient.keys()]);

    return [...allNames].sort((a, b) => a.localeCompare(b)).map((name) => {
      const c = overviewByClient.get(name);
      const n = notesByClient.get(name);
      return {
        name,
        meetings: c?.meetings ?? 0,
        recaps: c?.recaps ?? 0,
        tasks: c?.tasks ?? 0,
        openTasks: c?.openTasks ?? 0,
        status: n?.status ?? "ativo",
        oxyStage: n?.oxyStage ?? "nao_iniciado",
        importType: n?.importType ?? null,
        lastDataUpdate: n?.lastDataUpdate ?? null,
        oxyPendencies: n?.oxyPendencies ?? null,
        erp: n?.erp ?? null,
        healthStatus: n?.healthStatus ?? "verde",
      };
    });
  },
  ["clients-table"],
  { tags: ["calendar", "recaps", "tasks", "clients"], revalidate: 60 }
);

// Cached: dados completos de um cliente
export const getClientDetail = unstable_cache(
  async (client: string) => {
    const [events, recaps, tasks, clientNote, tratativas] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { client },
        orderBy: { startAt: "desc" },
      }),
      prisma.meetRecap.findMany({
        where: { client },
        select: { id: true, subject: true, createdAt: true, processedAt: true, suggestedTasks: true, client: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.task.findMany({
        where: { client },
        include: { assignee: { select: { id: true, name: true, image: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      }),
      prisma.clientNote.findUnique({ where: { client } }),
      prisma.tratativa.findMany({
        where: { client },
        include: { responsavel: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { events, recaps, tasks, clientNote, tratativas };
  },
  ["client-detail"],
  { tags: ["calendar", "recaps", "tasks", "clients", "tratativas"], revalidate: 30 }
);

// Cached: todas as tratativas (página /tratativas)
export const getTratativas = unstable_cache(
  async () =>
    prisma.tratativa.findMany({
      include: {
        responsavel: { select: { id: true, name: true, image: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ["tratativas-all"],
  { tags: ["tratativas"], revalidate: 15 }
);
