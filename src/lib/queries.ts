import { unstable_cache } from "next/cache";
import { forSquad } from "./tenant-prisma";
import { getIgnoredClients, matchesIgnoredClient } from "./settings";

// Cached: lista de usuários (muda raramente) — squadId entra como argumento da função
// cacheada, então o Next já diferencia o cache por squad automaticamente (não precisa
// duplicar squadId dentro do array de keyParts).
export const getUsers = unstable_cache(
  async (squadId: string) =>
    forSquad(squadId).user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, image: true, cargo: true, role: true },
    }),
  ["users"],
  { tags: ["users"], revalidate: 300 } // 5 min
);

// Cached: todas as tasks (invalida em mutações)
export const getAllTasks = unstable_cache(
  async (squadId: string) =>
    forSquad(squadId).task.findMany({
      include: { assignee: { select: { id: true, name: true, image: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
  ["tasks-all"],
  { tags: ["tasks"], revalidate: 10 }
);

// Cached: tasks de um usuário específico
export const getTasksByUser = unstable_cache(
  async (squadId: string, userId: string) =>
    forSquad(squadId).task.findMany({
      where: { assigneeId: userId },
      include: { assignee: { select: { id: true, name: true, image: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ["tasks-user"],
  { tags: ["tasks"], revalidate: 10 }
);

// Cached: recaps (invalida ao sincronizar)
export const getRecaps = unstable_cache(
  async (squadId: string) =>
    forSquad(squadId).meetRecap.findMany({
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
  async (squadId: string, year: number, month: number) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return forSquad(squadId).calendarEvent.findMany({
      where: { startAt: { gte: start, lte: end } },
      orderBy: { startAt: "asc" },
    });
  },
  ["calendar-events"],
  { tags: ["calendar"], revalidate: 120 }
);

// Cached: visão geral de clientes (card list)
export const getClientsOverview = unstable_cache(
  async (squadId: string) => {
    const db = forSquad(squadId);
    const [ignored, events, recaps, tasks] = await Promise.all([
      getIgnoredClients(squadId),
      db.calendarEvent.findMany({ select: { client: true }, where: { client: { not: "" } } }),
      db.meetRecap.findMany({ select: { client: true }, where: { client: { not: null } } }),
      db.task.findMany({ select: { client: true, status: true }, where: { client: { not: null } } }),
    ]);

    const map: Record<string, { meetings: number; recaps: number; tasks: number; openTasks: number }> = {};
    // empresa marcada como ignorada não é da carteira do squad (veio da agenda de alguém) —
    // fica fora da lista mesmo se ainda houver registro apontando pro nome
    const counts = (c: string | null) => {
      if (!c || matchesIgnoredClient(ignored, c)) return null;
      if (!map[c]) map[c] = { meetings: 0, recaps: 0, tasks: 0, openTasks: 0 };
      return map[c];
    };

    events.forEach((e) => { const m = counts(e.client); if (m) m.meetings++; });
    recaps.forEach((r) => { const m = counts(r.client); if (m) m.recaps++; });
    tasks.forEach((t) => {
      const m = counts(t.client);
      if (m) {
        m.tasks++;
        if (t.status !== "done") m.openTasks++;
      }
    });

    return Object.entries(map)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  ["clients-overview"],
  // tag "clients" também porque a lista de ignorados entra no resultado — sem ela,
  // ignorar/liberar um nome não refletiria aqui (nem em getClientsTable, que chama esta
  // função por dentro: revalidar só a de fora devolve o valor cacheado da de dentro)
  { tags: ["calendar", "recaps", "tasks", "clients"], revalidate: 60 }
);

// Cached: clientes com status geral + situação na Oxy, para a tabela de clientes
export const getClientsTable = unstable_cache(
  async (squadId: string) => {
    const db = forSquad(squadId);
    const [overview, notes] = await Promise.all([
      getClientsOverview(squadId),
      db.clientNote.findMany({
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
  async (squadId: string, client: string) => {
    const db = forSquad(squadId);
    const [events, recaps, tasks, clientNote, tratativas] = await Promise.all([
      db.calendarEvent.findMany({
        where: { client },
        orderBy: { startAt: "desc" },
      }),
      db.meetRecap.findMany({
        where: { client },
        select: { id: true, subject: true, createdAt: true, processedAt: true, suggestedTasks: true, client: true },
        orderBy: { createdAt: "desc" },
      }),
      db.task.findMany({
        where: { client },
        include: { assignee: { select: { id: true, name: true, image: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      }),
      db.clientNote.findUnique({ where: { squadId_client: { squadId, client } } }),
      db.tratativa.findMany({
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
  async (squadId: string) =>
    forSquad(squadId).tratativa.findMany({
      include: {
        responsavel: { select: { id: true, name: true, image: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ["tratativas-all"],
  { tags: ["tratativas"], revalidate: 15 }
);
