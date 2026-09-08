import type Groq from "groq-sdk";
import { forSquad, type SquadPrisma } from "./tenant-prisma";
import { isTaskOverdue, normalizeText, brtNow } from "./utils";

// Ferramentas do assistente de IA (botão flutuante) — todas SOMENTE LEITURA de propósito.
// O assistente responde perguntas sobre o que já existe na plataforma; ele nunca cria,
// edita ou apaga nada (mesma filosofia das Sugestões da IA: a IA nunca age sozinha,
// só informa — quem decide e clica é sempre uma pessoa).

// Quantas mensagens (usuário + assistente) manter como memória — controla tanto o que
// é carregado pro contexto do Groq quanto o que aparece no histórico da tela. Um teto
// simples em vez de tudo desde sempre, pra não deixar o prompt crescer sem limite.
export const ASSISTANT_HISTORY_LIMIT = 30;

const MILESTONES = [
  { key: "cfoAllocatedAt", label: "CFO alocado", offsetDays: 2 },
  { key: "kickoffScheduledAt", label: "Kickoff agendado", offsetDays: 3 },
  { key: "kickoffDoneAt", label: "Kickoff realizado", offsetDays: 7 },
  { key: "setupDoneAt", label: "Setup + Comitê de Estruturação", offsetDays: 30 },
  { key: "diagnosticDoneAt", label: "Diagnóstico + Comitê de Diagnóstico", offsetDays: 60 },
  { key: "oxyIntegratedAt", label: "Oxy integrada + Comitê Estratégico Mensal", offsetDays: 90 },
] as const;

// Dois formatadores, de propósito — misturar os dois era o que fazia data aparecer
// deslocada em um dia pro assistente:
// - fmtDay: campos que são SÓ um dia (dueDate, prazo de tratativa, marco de onboarding).
//   Ficam gravados como meia-noite UTC, então ler em UTC devolve o dia certo.
// - fmtMoment: instantes de verdade (createdAt, início de reunião). Precisam ser lidos
//   em America/Sao_Paulo, senão uma reunião das 9h vira "12:00" e um registro feito
//   às 22h de Brasília vira o dia seguinte.
function fmtDay(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

const BRT_DATETIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function fmtMoment(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = BRT_DATETIME.formatToParts(d);
  const g = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

// Janela de datas a partir de um termo relativo, resolvida NO SERVIDOR com o dia de
// Brasília. Sem isso o modelo tinha que inventar qual é "hoje" pra preencher
// dueBefore/dueAfter — foi exatamente daí que veio o "hoje é 31 de agosto".
export type DueRelative = "atrasadas" | "hoje" | "amanha" | "esta_semana" | "proximos_7_dias" | "sem_prazo";

export function resolveDueWindow(term: DueRelative): { gte?: Date; lte?: Date; isNull?: boolean } {
  const { today } = brtNow();
  const day = (offset: number) => new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
  switch (term) {
    case "atrasadas": return { lte: new Date(today.getTime() - 1) };
    case "hoje": return { gte: today, lte: today };
    case "amanha": return { gte: day(1), lte: day(1) };
    // semana corrente = de hoje até domingo (getUTCDay: 0=domingo)
    case "esta_semana": return { gte: today, lte: day((7 - today.getUTCDay()) % 7) };
    case "proximos_7_dias": return { gte: today, lte: day(7) };
    case "sem_prazo": return { isNull: true };
  }
}

// Resolve o nome "oficial" do cliente (como está gravado no banco) a partir do texto
// livre que a pessoa digitou no chat — tolera acento/caixa diferente (Postgres
// `contains` sozinho não ignora acento, então "cafe" não bate com "Café" de outro jeito),
// comparando contra a carteira em ClientNote. Retorna null se não achar nenhum parecido.
async function resolveClientName(db: SquadPrisma, input: string): Promise<string | null> {
  const target = normalizeText(input);
  if (!target) return null;
  const notes = await db.clientNote.findMany({ select: { client: true } });
  const exact = notes.find((c) => normalizeText(c.client) === target);
  if (exact) return exact.client;
  const partial = notes.find((c) => normalizeText(c.client).includes(target) || target.includes(normalizeText(c.client)));
  return partial?.client ?? null;
}

async function getUrgentItems(squadId: string) {
  const db = forSquad(squadId);
  const now = new Date();

  const [openTasks, tratativasAbertas, clientesAtivos] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "done" }, dueDate: { not: null } },
      select: { id: true, title: true, client: true, priority: true, dueDate: true, status: true, assignee: { select: { name: true } } },
    }),
    db.tratativa.findMany({
      where: { status: { not: "concluida" }, dataPrevistaFinalizacao: { not: null, lt: now } },
      select: { client: true, motivo: true, tipo: true, dataPrevistaFinalizacao: true, responsavel: { select: { name: true } } },
    }),
    db.clientNote.findMany({ where: { status: "ativo", onboardingStartAt: { not: null } } }),
  ]);

  const overdueTasks = openTasks
    .filter((t) => isTaskOverdue(t.dueDate, t.status))
    .slice(0, 20)
    .map((t) => ({ title: t.title, client: t.client, priority: t.priority, dueDate: fmtDay(t.dueDate), assignee: t.assignee?.name ?? null }));

  const overdueTratativas = tratativasAbertas.slice(0, 20).map((t) => ({
    client: t.client,
    motivo: t.motivo,
    tipo: t.tipo,
    prazo: fmtDay(t.dataPrevistaFinalizacao),
    responsavel: t.responsavel?.name ?? null,
  }));

  const onboardingAtrasado: { client: string; marco: string; prazo: string }[] = [];
  for (const c of clientesAtivos) {
    for (const m of MILESTONES) {
      if (c[m.key as keyof typeof c]) continue;
      const target = new Date(c.onboardingStartAt!);
      target.setDate(target.getDate() + m.offsetDays);
      if (target >= now) continue;
      onboardingAtrasado.push({ client: c.client, marco: m.label, prazo: fmtDay(target)! });
    }
  }

  const [currentYear, currentMonth] = [now.getFullYear(), now.getMonth() + 1];
  const clientesAtivosNomes = await db.clientNote.findMany({ where: { status: "ativo" }, select: { client: true } });
  const fechamentos = await db.fechamentoMensal.findMany({
    where: { year: currentYear, month: currentMonth, client: { in: clientesAtivosNomes.map((c) => c.client) } },
  });
  const fechamentoPorCliente = new Map(fechamentos.map((f) => [f.client, f]));
  const fechamentoIncompleto = clientesAtivosNomes
    .filter((c) => {
      const f = fechamentoPorCliente.get(c.client);
      return !f || !f.comiteRealizado || !f.rebalanceamentoFeito || !f.conciliacaoOk || !f.cpCrFechados;
    })
    .map((c) => c.client);

  const sugestoesIaPendentesHaMuitoTempo = await db.recapSuggestion.count({
    where: { status: "pending", createdAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) }, recap: { squadId } },
  });

  return {
    tarefasAtrasadas: overdueTasks,
    tratativasVencidas: overdueTratativas,
    onboardingAtrasado,
    fechamentoIncompleto_mesAtual: fechamentoIncompleto,
    sugestoesDeIaPendentesHaMaisDe3Dias: sugestoesIaPendentesHaMuitoTempo,
  };
}

async function searchTasks(squadId: string, args: {
  status?: string;
  client?: string;
  assigneeName?: string;
  dueRelative?: DueRelative;
  dueBefore?: string;
  dueAfter?: string;
  textSearch?: string;
  limit?: number | string;
}) {
  const db = forSquad(squadId);
  // o Groq às vezes manda number como string (ex: "15") — não confiar no tipo declarado
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30);
  const resolvedClient = args.client ? await resolveClientName(db, args.client) : null;

  // Prazo: `dueRelative` é o caminho preferido (resolvido aqui com o dia de Brasília,
  // sem depender de o modelo saber que dia é hoje); dueBefore/dueAfter seguem valendo
  // pra data específica que a pessoa disser.
  const window = args.dueRelative ? resolveDueWindow(args.dueRelative) : null;
  const dueFilter = window
    ? window.isNull
      ? { dueDate: null }
      : { dueDate: { ...(window.gte ? { gte: window.gte } : {}), ...(window.lte ? { lte: window.lte } : {}) } }
    : args.dueBefore || args.dueAfter
    ? { dueDate: { ...(args.dueBefore ? { lte: new Date(args.dueBefore) } : {}), ...(args.dueAfter ? { gte: new Date(args.dueAfter) } : {}) } }
    : {};

  // Os filtros de "ou" vão em AND[] porque são DOIS: nome do responsável e texto livre.
  // Como chaves `OR` irmãs no mesmo objeto, a segunda sobrescrevia a primeira — buscar
  // "tarefa da Tainara sobre balancete" ignorava a Tainara calado.
  const anyOf: object[] = [];
  if (args.assigneeName) {
    anyOf.push({
      OR: [
        { assignee: { name: { contains: args.assigneeName, mode: "insensitive" as const } } },
        { assignees: { some: { user: { name: { contains: args.assigneeName, mode: "insensitive" as const } } } } },
      ],
    });
  }
  if (args.textSearch) {
    anyOf.push({
      OR: [
        { title: { contains: args.textSearch, mode: "insensitive" as const } },
        { description: { contains: args.textSearch, mode: "insensitive" as const } },
      ],
    });
  }

  const tasks = await db.task.findMany({
    where: {
      ...(args.status ? { status: args.status } : {}),
      ...(resolvedClient
        ? { client: resolvedClient }
        : args.client
        ? { client: { contains: args.client, mode: "insensitive" } }
        : {}),
      ...dueFilter,
      ...(anyOf.length > 0 ? { AND: anyOf } : {}),
    },
    select: {
      title: true, status: true, priority: true, client: true, dueDate: true, deliverTo: true,
      assignee: { select: { name: true } },
      assignees: { select: { isClient: true, done: true, part: true, role: true, user: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return tasks.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    client: t.client,
    dueDate: fmtDay(t.dueDate),
    quemEntrega: t.deliverTo,
    assignee: t.assignee?.name ?? null,
    ...(t.assignees.length > 0 && {
      emConjunto: t.assignees.map((a) => ({
        quem: a.isClient ? t.client || "Cliente" : a.user?.name ?? null,
        dono: a.role === "principal",
        parte: a.part,
        concluiu: a.done,
      })),
    }),
  }));
}

async function findClientNote(db: SquadPrisma, squadId: string, name: string) {
  const resolved = await resolveClientName(db, name);
  if (!resolved) return null;
  return db.clientNote.findUnique({ where: { squadId_client: { squadId, client: resolved } } });
}

async function getClientOverview(squadId: string, args: { client: string }) {
  const db = forSquad(squadId);
  const note = await findClientNote(db, squadId, args.client);
  if (!note) {
    const all = await db.clientNote.findMany({ select: { client: true } });
    const target = normalizeText(args.client);
    const similares = all.map((c) => c.client).filter((c) => normalizeText(c).includes(target.slice(0, 4)));
    return { encontrado: false, mensagem: `Nenhum cliente chamado "${args.client}" encontrado.`, clientesParecidos: similares.slice(0, 5) };
  }

  const now = new Date();
  const [openTasks, tratativas, fechamento, upcomingMeetings] = await Promise.all([
    db.task.findMany({
      where: { client: note.client, status: { not: "done" } },
      select: { title: true, status: true, priority: true, dueDate: true },
      take: 15,
    }),
    db.tratativa.findMany({
      where: { client: note.client, status: { not: "concluida" } },
      select: { motivo: true, tipo: true, status: true, dataPrevistaFinalizacao: true },
    }),
    db.fechamentoMensal.findUnique({
      where: { squadId_client_year_month: { squadId, client: note.client, year: now.getFullYear(), month: now.getMonth() + 1 } },
    }),
    db.calendarEvent.findMany({
      where: { client: note.client, startAt: { gte: now } },
      select: { title: true, startAt: true, meetingType: true },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  const milestones = MILESTONES.map((m) => ({
    marco: m.label,
    feito: !!note[m.key as keyof typeof note],
    data: fmtDay(note[m.key as keyof typeof note] as Date | null),
  }));

  return {
    encontrado: true,
    client: note.client,
    status: note.status,
    healthStatus: note.healthStatus,
    oxyStage: note.oxyStage,
    onboardingStartAt: fmtDay(note.onboardingStartAt),
    marcosDeOnboarding: milestones,
    tarefasAbertas: openTasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, dueDate: fmtDay(t.dueDate) })),
    tratativasAbertas: tratativas.map((t) => ({ motivo: t.motivo, tipo: t.tipo, status: t.status, prazo: fmtDay(t.dataPrevistaFinalizacao) })),
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

async function listClients(squadId: string, args: { status?: string; healthStatus?: string }) {
  const clients = await forSquad(squadId).clientNote.findMany({
    where: { ...(args.status ? { status: args.status } : {}), ...(args.healthStatus ? { healthStatus: args.healthStatus } : {}) },
    select: { client: true, status: true, healthStatus: true, oxyStage: true },
    orderBy: { client: "asc" },
  });
  return clients;
}

async function getUpcomingMeetings(squadId: string, args: { days?: number | string; client?: string }) {
  const db = forSquad(squadId);
  // o Groq às vezes manda number como string (ex: "7") — não confiar no tipo declarado
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 60);
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const resolvedClient = args.client ? await resolveClientName(db, args.client) : null;
  const events = await db.calendarEvent.findMany({
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
  // hora de Brasília e não ISO em UTC — senão uma reunião das 09:00 chega ao modelo
  // como "12:00Z" e ele reporta o horário errado
  return events.map((e) => ({ title: e.title, client: e.client, data: fmtMoment(e.startAt), tipo: e.meetingType }));
}

async function getPendingAiSuggestions(squadId: string) {
  const db = forSquad(squadId);
  const [recapPending, recapDuplicate, externalPending, externalDuplicate, oldest] = await Promise.all([
    db.recapSuggestion.count({ where: { status: "pending", recap: { squadId } } }),
    db.recapSuggestion.count({ where: { status: "duplicate", recap: { squadId } } }),
    db.externalSuggestion.count({ where: { status: "pending" } }),
    db.externalSuggestion.count({ where: { status: "duplicate" } }),
    db.recapSuggestion.findFirst({ where: { status: "pending", recap: { squadId } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    meetRecapPendentes: recapPending,
    meetRecapDuplicadas: recapDuplicate,
    n8nPendentes: externalPending,
    n8nDuplicadas: externalDuplicate,
    sugestaoMaisAntigaPendenteDesde: oldest ? fmtMoment(oldest.createdAt) : null,
  };
}

async function getTratativas(squadId: string, args: { status?: string; client?: string }) {
  const db = forSquad(squadId);
  const resolvedClient = args.client ? await resolveClientName(db, args.client) : null;
  const tratativas = await db.tratativa.findMany({
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
    prazo: fmtDay(t.dataPrevistaFinalizacao),
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
      description:
        "Busca tarefas por status, cliente, responsável, prazo ou texto no título/descrição. Para prazo relativo ('hoje', 'amanhã', 'essa semana', 'atrasadas') use dueRelative, que é resolvido no servidor.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"], description: "Status da tarefa" },
          client: { type: "string", description: "Nome do cliente (busca parcial)" },
          assigneeName: { type: "string", description: "Nome do responsável (busca parcial) — acha tanto quem é dono quanto quem participa de tarefa em conjunto" },
          dueRelative: {
            type: "string",
            enum: ["atrasadas", "hoje", "amanha", "esta_semana", "proximos_7_dias", "sem_prazo"],
            description:
              "PREFIRA ESTE para prazo relativo ('hoje', 'amanhã', 'essa semana', 'atrasadas', 'sem prazo'). A data é calculada no servidor com o dia de hoje em Brasília — não tente converter pra YYYY-MM-DD você mesmo.",
          },
          dueBefore: { type: "string", description: "Só para data específica que a pessoa citou. Prazo até essa data, formato YYYY-MM-DD" },
          dueAfter: { type: "string", description: "Só para data específica que a pessoa citou. Prazo a partir dessa data, formato YYYY-MM-DD" },
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

export async function runTool(squadId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_urgent_items":
      return getUrgentItems(squadId);
    case "search_tasks":
      return searchTasks(squadId, args);
    case "get_client_overview":
      return getClientOverview(squadId, args as { client: string });
    case "list_clients":
      return listClients(squadId, args);
    case "get_upcoming_meetings":
      return getUpcomingMeetings(squadId, args);
    case "get_pending_ai_suggestions":
      return getPendingAiSuggestions(squadId);
    case "get_tratativas":
      return getTratativas(squadId, args);
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
