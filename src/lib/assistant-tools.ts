import type Groq from "groq-sdk";
import { prisma } from "./prisma";
import { isTaskOverdue, normalizeText } from "./utils";

// Ferramentas do assistente de IA (botão flutuante) — todas SOMENTE LEITURA de propósito.
// O assistente responde perguntas sobre o que já existe na plataforma; ele nunca cria,
// edita ou apaga nada (mesma filosofia das Sugestões da IA: a IA nunca age sozinha,
// só informa — quem decide e clica é sempre uma pessoa).

const MILESTONES = [
  { key: "cfoAllocatedAt", label: "CFO alocado", offsetDays: 2 },
  { key: "kickoffScheduledAt", label: "Kickoff agendado", offsetDays: 3 },
  { key: "kickoffDoneAt", label: "Kickoff realizado", offsetDays: 7 },
  { key: "setupDoneAt", label: "Setup + Comitê de Estruturação", offsetDays: 30 },
  { key: "diagnosticDoneAt", label: "Diagnóstico + Comitê de Diagnóstico", offsetDays: 60 },
  { key: "oxyIntegratedAt", label: "Oxy integrada + Comitê Estratégico Mensal", offsetDays: 90 },
] as const;

function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Resolve o nome "oficial" do cliente (como está gravado no banco) a partir do texto
// livre que a pessoa digitou no chat — tolera acento/caixa diferente (Postgres
// `contains` sozinho não ignora acento, então "cafe" não bate com "Café" de outro jeito),
// comparando contra a carteira em ClientNote. Retorna null se não achar nenhum parecido.
async function resolveClientName(input: string): Promise<string | null> {
  const target = normalizeText(input);
  if (!target) return null;
  const notes = await prisma.clientNote.findMany({ select: { client: true } });
  const exact = notes.find((c) => normalizeText(c.client) === target);
  if (exact) return exact.client;
  const partial = notes.find((c) => normalizeText(c.client).includes(target) || target.includes(normalizeText(c.client)));
  return partial?.client ?? null;
}

async function getUrgentItems() {
  const now = new Date();

  const [openTasks, tratativasAbertas, clientesAtivos] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "done" }, dueDate: { not: null } },
      select: { id: true, title: true, client: true, priority: true, dueDate: true, status: true, assignee: { select: { name: true } } },
    }),
    prisma.tratativa.findMany({
      where: { status: { not: "concluida" }, dataPrevistaFinalizacao: { not: null, lt: now } },
      select: { client: true, motivo: true, tipo: true, dataPrevistaFinalizacao: true, responsavel: { select: { name: true } } },
    }),
    prisma.clientNote.findMany({ where: { status: "ativo", onboardingStartAt: { not: null } } }),
  ]);

  const overdueTasks = openTasks
    .filter((t) => isTaskOverdue(t.dueDate, t.status))
    .slice(0, 20)
    .map((t) => ({ title: t.title, client: t.client, priority: t.priority, dueDate: fmtDate(t.dueDate), assignee: t.assignee?.name ?? null }));

  const overdueTratativas = tratativasAbertas.slice(0, 20).map((t) => ({
    client: t.client,
    motivo: t.motivo,
    tipo: t.tipo,
    prazo: fmtDate(t.dataPrevistaFinalizacao),
    responsavel: t.responsavel?.name ?? null,
  }));

  const onboardingAtrasado: { client: string; marco: string; prazo: string }[] = [];
  for (const c of clientesAtivos) {
    for (const m of MILESTONES) {
      if (c[m.key as keyof typeof c]) continue;
      const target = new Date(c.onboardingStartAt!);
      target.setDate(target.getDate() + m.offsetDays);
      if (target >= now) continue;
      onboardingAtrasado.push({ client: c.client, marco: m.label, prazo: fmtDate(target)! });
    }
  }

  const [currentYear, currentMonth] = [now.getFullYear(), now.getMonth() + 1];
  const clientesAtivosNomes = await prisma.clientNote.findMany({ where: { status: "ativo" }, select: { client: true } });
  const fechamentos = await prisma.fechamentoMensal.findMany({
    where: { year: currentYear, month: currentMonth, client: { in: clientesAtivosNomes.map((c) => c.client) } },
  });
  const fechamentoPorCliente = new Map(fechamentos.map((f) => [f.client, f]));
  const fechamentoIncompleto = clientesAtivosNomes
    .filter((c) => {
      const f = fechamentoPorCliente.get(c.client);
      return !f || !f.comiteRealizado || !f.rebalanceamentoFeito || !f.conciliacaoOk || !f.cpCrFechados;
    })
    .map((c) => c.client);

  const sugestoesIaPendentesHaMuitoTempo = await prisma.recapSuggestion.count({
    where: { status: "pending", createdAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
  });

  return {
    tarefasAtrasadas: overdueTasks,
    tratativasVencidas: overdueTratativas,
    onboardingAtrasado,
    fechamentoIncompleto_mesAtual: fechamentoIncompleto,
    sugestoesDeIaPendentesHaMaisDe3Dias: sugestoesIaPendentesHaMuitoTempo,
  };
}

async function searchTasks(args: {
  status?: string;
  client?: string;
  assigneeName?: string;
  dueBefore?: string;
  dueAfter?: string;
  textSearch?: string;
  limit?: number | string;
}) {
  // o Groq às vezes manda number como string (ex: "15") — não confiar no tipo declarado
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30);
  const resolvedClient = args.client ? await resolveClientName(args.client) : null;
  const tasks = await prisma.task.findMany({
    where: {
      ...(args.status ? { status: args.status } : {}),
      ...(resolvedClient
        ? { client: resolvedClient }
        : args.client
        ? { client: { contains: args.client, mode: "insensitive" } }
        : {}),
      ...(args.assigneeName ? { assignee: { name: { contains: args.assigneeName, mode: "insensitive" } } } : {}),
      ...(args.dueBefore || args.dueAfter
        ? { dueDate: { ...(args.dueBefore ? { lte: new Date(args.dueBefore) } : {}), ...(args.dueAfter ? { gte: new Date(args.dueAfter) } : {}) } }
        : {}),
      ...(args.textSearch
        ? { OR: [{ title: { contains: args.textSearch, mode: "insensitive" } }, { description: { contains: args.textSearch, mode: "insensitive" } }] }
        : {}),
    },
    select: { title: true, status: true, priority: true, client: true, dueDate: true, deliverTo: true, assignee: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return tasks.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    client: t.client,
    dueDate: fmtDate(t.dueDate),
    quemEntrega: t.deliverTo,
    assignee: t.assignee?.name ?? null,
  }));
}

async function findClientNote(name: string) {
  const resolved = await resolveClientName(name);
  if (!resolved) return null;
  return prisma.clientNote.findUnique({ where: { client: resolved } });
}

async function getClientOverview(args: { client: string }) {
  const note = await findClientNote(args.client);
  if (!note) {
    const all = await prisma.clientNote.findMany({ select: { client: true } });
    const target = normalizeText(args.client);
    const similares = all.map((c) => c.client).filter((c) => normalizeText(c).includes(target.slice(0, 4)));
    return { encontrado: false, mensagem: `Nenhum cliente chamado "${args.client}" encontrado.`, clientesParecidos: similares.slice(0, 5) };
  }

  const now = new Date();
  const [openTasks, tratativas, fechamento, upcomingMeetings] = await Promise.all([
    prisma.task.findMany({
      where: { client: note.client, status: { not: "done" } },
      select: { title: true, status: true, priority: true, dueDate: true },
      take: 15,
    }),
    prisma.tratativa.findMany({
      where: { client: note.client, status: { not: "concluida" } },
      select: { motivo: true, tipo: true, status: true, dataPrevistaFinalizacao: true },
    }),
    prisma.fechamentoMensal.findUnique({
      where: { client_year_month: { client: note.client, year: now.getFullYear(), month: now.getMonth() + 1 } },
    }),
    prisma.calendarEvent.findMany({
      where: { client: note.client, startAt: { gte: now } },
      select: { title: true, startAt: true, meetingType: true },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  const milestones = MILESTONES.map((m) => ({
    marco: m.label,
    feito: !!note[m.key as keyof typeof note],
    data: fmtDate(note[m.key as keyof typeof note] as Date | null),
  }));

  return {
    encontrado: true,
    client: note.client,
    status: note.status,
    healthStatus: note.healthStatus,
    oxyStage: note.oxyStage,
    onboardingStartAt: fmtDate(note.onboardingStartAt),
    marcosDeOnboarding: milestones,
    tarefasAbertas: openTasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, dueDate: fmtDate(t.dueDate) })),
    tratativasAbertas: tratativas.map((t) => ({ motivo: t.motivo, tipo: t.tipo, status: t.status, prazo: fmtDate(t.dataPrevistaFinalizacao) })),
    fechamentoMesAtual: fechamento
      ? {
          comiteRealizado: fechamento.comiteRealizado,
          rebalanceamentoFeito: fechamento.rebalanceamentoFeito,
          conciliacaoOk: fechamento.conciliacaoOk,
          cpCrFechados: fechamento.cpCrFechados,
        }
      : null,
    proximasReunioes: upcomingMeetings.map((e) => ({ title: e.title, data: e.startAt.toISOString(), tipo: e.meetingType })),
  };
}

async function listClients(args: { status?: string; healthStatus?: string }) {
  const clients = await prisma.clientNote.findMany({
    where: { ...(args.status ? { status: args.status } : {}), ...(args.healthStatus ? { healthStatus: args.healthStatus } : {}) },
    select: { client: true, status: true, healthStatus: true, oxyStage: true },
    orderBy: { client: "asc" },
  });
  return clients;
}

async function getUpcomingMeetings(args: { days?: number | string; client?: string }) {
  // o Groq às vezes manda number como string (ex: "7") — não confiar no tipo declarado
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 60);
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const resolvedClient = args.client ? await resolveClientName(args.client) : null;
  const events = await prisma.calendarEvent.findMany({
    where: {
      startAt: { gte: now, lte: until },
      ...(resolvedClient
        ? { client: resolvedClient }
        : args.client
        ? { client: { contains: args.client, mode: "insensitive" } }
        : {}),
    },
    select: { title: true, client: true, startAt: true, meetingType: true },
    orderBy: { startAt: "asc" },
    take: 30,
  });
  return events.map((e) => ({ title: e.title, client: e.client, data: e.startAt.toISOString(), tipo: e.meetingType }));
}

async function getPendingAiSuggestions() {
  const [recapPending, recapDuplicate, externalPending, externalDuplicate, oldest] = await Promise.all([
    prisma.recapSuggestion.count({ where: { status: "pending" } }),
    prisma.recapSuggestion.count({ where: { status: "duplicate" } }),
    prisma.externalSuggestion.count({ where: { status: "pending" } }),
    prisma.externalSuggestion.count({ where: { status: "duplicate" } }),
    prisma.recapSuggestion.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    meetRecapPendentes: recapPending,
    meetRecapDuplicadas: recapDuplicate,
    n8nPendentes: externalPending,
    n8nDuplicadas: externalDuplicate,
    sugestaoMaisAntigaPendenteDesde: oldest ? fmtDate(oldest.createdAt) : null,
  };
}

async function getTratativas(args: { status?: string; client?: string }) {
  const resolvedClient = args.client ? await resolveClientName(args.client) : null;
  const tratativas = await prisma.tratativa.findMany({
    where: {
      ...(args.status ? { status: args.status } : {}),
      ...(resolvedClient
        ? { client: resolvedClient }
        : args.client
        ? { client: { contains: args.client, mode: "insensitive" } }
        : {}),
    },
    select: {
      client: true,
      tipo: true,
      motivo: true,
      status: true,
      dataPrevistaFinalizacao: true,
      desfecho: true,
      responsavel: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return tratativas.map((t) => ({
    client: t.client,
    tipo: t.tipo,
    motivo: t.motivo,
    status: t.status,
    prazo: fmtDate(t.dataPrevistaFinalizacao),
    desfecho: t.desfecho,
    responsavel: t.responsavel?.name ?? null,
  }));
}

export const ASSISTANT_TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_urgent_items",
      description:
        "Retorna um raio-x do que precisa de atenção agora: tarefas atrasadas, tratativas com prazo vencido, marcos de onboarding atrasados, fechamento mensal incompleto e sugestões da IA paradas há mais de 3 dias. Use pra perguntas tipo 'o que está atrasado', 'o que precisa de atenção', 'coisas urgentes'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Busca tarefas por status, cliente, responsável, prazo ou texto no título/descrição.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"], description: "Status da tarefa" },
          client: { type: "string", description: "Nome do cliente (busca parcial)" },
          assigneeName: { type: "string", description: "Nome do responsável (busca parcial)" },
          dueBefore: { type: "string", description: "Prazo até essa data, formato YYYY-MM-DD" },
          dueAfter: { type: "string", description: "Prazo a partir dessa data, formato YYYY-MM-DD" },
          textSearch: { type: "string", description: "Texto livre pra buscar no título/descrição" },
          limit: { type: ["number", "string"], description: "Máximo de resultados (padrão 15, máximo 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_overview",
      description: "Visão geral de um cliente específico: status, saúde da conta, onboarding, tarefas abertas, tratativas, fechamento do mês e próximas reuniões.",
      parameters: {
        type: "object",
        properties: { client: { type: "string", description: "Nome do cliente" } },
        required: ["client"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Lista os clientes da carteira, opcionalmente filtrando por status (ativo/pausado/encerrado) ou saúde da conta (verde/amarelo/vermelho).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ativo", "pausado", "encerrado"] },
          healthStatus: { type: "string", enum: ["verde", "amarelo", "vermelho"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_meetings",
      description: "Lista as próximas reuniões agendadas (Google Calendar), opcionalmente de um cliente específico.",
      parameters: {
        type: "object",
        properties: {
          days: { type: ["number", "string"], description: "Quantos dias pra frente olhar (padrão 7, máximo 60)" },
          client: { type: "string", description: "Filtrar por cliente" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_ai_suggestions",
      description: "Resumo das sugestões de tarefa da IA (Meet Recap e n8n) ainda pendentes de revisão em /sugestoes-ia.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tratativas",
      description: "Lista tratativas (preventivas/reativas com cliente), opcionalmente filtrando por status ou cliente.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["triagem", "em_tratativa", "plano_de_acao", "concluida"] },
          client: { type: "string" },
        },
      },
    },
  },
];

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_urgent_items":
      return getUrgentItems();
    case "search_tasks":
      return searchTasks(args);
    case "get_client_overview":
      return getClientOverview(args as { client: string });
    case "list_clients":
      return listClients(args);
    case "get_upcoming_meetings":
      return getUpcomingMeetings(args);
    case "get_pending_ai_suggestions":
      return getPendingAiSuggestions();
    case "get_tratativas":
      return getTratativas(args);
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
