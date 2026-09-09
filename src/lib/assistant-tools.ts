import type Groq from "groq-sdk";
import { forSquad, type SquadPrisma } from "./tenant-prisma";
import { isTaskOverdue, normalizeText, brtNow } from "./utils";
import { findDuplicateNote } from "./duplicate-detection";
import { log } from "./logger";
import { revalidateTag } from "next/cache";
import { prisma } from "./prisma";
import { normalizeAssignees, syncTaskAssignees, CLIENT_CHOICE } from "./task-assignees";
import {
  resolveTarget, buildChanges, createPendingAction,
  resolveTratativa, buildTratativaChanges, buildTratativaCreate,
  resolveClientTarget, buildClientChanges,
  buildCalendarEventCreate,
} from "./assistant-actions";
import { resolveClientName, knownClientNames } from "./client-resolve";
import { removeIgnoredClient } from "./settings";
import { notifyTaskReminder } from "./slack";

const PRIORITIES_OK = ["high", "medium", "low"];

// Quem esta falando com o assistente. So a ferramenta de propor tarefa usa (pra registrar
// a pedido de quem a sugestao nasceu) — as de leitura sao todas escopadas por squad.
export type ToolContext = {
  userId: string;
  userName: string | null;
  // canal de volta pra rota do chat: alterar_tarefa preenche com o id da acao que ficou
  // esperando confirmacao, e a resposta do chat leva isso pro botao aparecer na tela
  pendingActionId?: string | null;
};

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


// ---------------------------------------------------------------------------
// Busca no conteúdo dos Meet Recaps
//
// Duas restrições reais moldaram esta função:
// 1. As 69 transcrições somam ~200 mil caracteres (~50 mil tokens). Mandar corpo
//    inteiro estoura o contexto, então devolve TRECHO em volta do que casou.
// 2. Só 1 dos 69 recaps tem `client` preenchido — esse campo é extraído pela IA e a
//    extração está pausada desde 2026-07-21. Por isso filtrar por cliente procura o
//    nome também no assunto/corpo, em vez de confiar na coluna.
const RECAP_EXCERPT_RADIUS = 260;

function excerptAround(body: string, term: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const head = () => clean.slice(0, RECAP_EXCERPT_RADIUS * 2) + (clean.length > RECAP_EXCERPT_RADIUS * 2 ? "…" : "");
  if (!term) return head();
  const at = normalizeText(clean).indexOf(normalizeText(term));
  if (at < 0) return head();
  const from = Math.max(0, at - RECAP_EXCERPT_RADIUS);
  const to = Math.min(clean.length, at + term.length + RECAP_EXCERPT_RADIUS);
  return (from > 0 ? "…" : "") + clean.slice(from, to) + (to < clean.length ? "…" : "");
}

async function searchMeetRecaps(
  squadId: string,
  args: { textSearch?: string; client?: string; days?: number | string; limit?: number | string }
) {
  const db = forSquad(squadId);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
  const term = (args.textSearch || "").trim();
  const clientTerm = (args.client || "").trim();
  if (!term && !clientTerm) {
    return { erro: "Diga o que procurar (textSearch) ou de qual cliente (client)." };
  }

  const days = Number(args.days) || 0;
  const since = days > 0 ? new Date(Date.now() - days * 86400000) : undefined;

  const conditions: object[] = [];
  if (term) {
    conditions.push({
      OR: [
        { subject: { contains: term, mode: "insensitive" as const } },
        { body: { contains: term, mode: "insensitive" as const } },
      ],
    });
  }
  if (clientTerm) {
    const resolved = await resolveClientName(db, clientTerm);
    const name = resolved ?? clientTerm;
    conditions.push({
      OR: [
        { client: name },
        { subject: { contains: name, mode: "insensitive" as const } },
        { body: { contains: name, mode: "insensitive" as const } },
      ],
    });
  }

  const recaps = await db.meetRecap.findMany({
    where: { ...(since ? { createdAt: { gte: since } } : {}), AND: conditions },
    select: { id: true, subject: true, client: true, createdAt: true, body: true, source: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    encontrados: recaps.length,
    reunioes: recaps.map((r) => ({
      assunto: r.subject,
      data: fmtMoment(r.createdAt),
      cliente: r.client,
      origem: r.source,
      trecho: excerptAround(r.body, term || clientTerm),
    })),
    observacao:
      recaps.length > 0 ? "Os trechos são recortes da transcrição, não a ata inteira. A completa está em /recaps." : undefined,
  };
}

// Carga do squad — quem está com o quê. Conta tarefa em conjunto separando o que a
// pessoa é dona do que ela só participa (a cobrança é do dono, ver task-assignees.ts).
async function getTeamWorkload(squadId: string) {
  const db = forSquad(squadId);
  const { today } = brtNow();
  const semanaAtras = new Date(today.getTime() - 7 * 86400000);

  const [users, tasks] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, cargo: true }, orderBy: { name: "asc" } }),
    db.task.findMany({
      select: {
        id: true, status: true, dueDate: true, priority: true, assigneeId: true, updatedAt: true,
        assignees: { select: { userId: true, role: true, done: true } },
      },
    }),
  ]);

  const porPessoa = users.map((u) => {
    const comoDono = tasks.filter((t) => t.assigneeId === u.id);
    const soParticipante = tasks.filter((t) => t.assigneeId !== u.id && t.assignees.some((a) => a.userId === u.id));
    const abertas = comoDono.filter((t) => t.status !== "done");
    return {
      pessoa: u.name || u.email,
      cargo: u.cargo,
      abertas: abertas.length,
      atrasadas: abertas.filter((t) => isTaskOverdue(t.dueDate, t.status)).length,
      altaPrioridade: abertas.filter((t) => t.priority === "high").length,
      concluidasUltimos7Dias: comoDono.filter((t) => t.status === "done" && t.updatedAt >= semanaAtras).length,
      participaSemSerDona: soParticipante.filter((t) => t.status !== "done").length,
      partesPendentesDela: soParticipante.filter(
        (t) => t.status !== "done" && t.assignees.some((a) => a.userId === u.id && !a.done)
      ).length,
    };
  });

  const semDono = tasks.filter((t) => t.status !== "done" && !t.assigneeId);
  return {
    porPessoa: porPessoa.sort((a, b) => b.abertas - a.abertas),
    tarefasSemResponsavelHumano: semDono.length,
    observacao:
      "'abertas' e 'atrasadas' contam só as tarefas em que a pessoa é a DONA. 'participaSemSerDona' são tarefas em conjunto de outra pessoa em que ela entra como participante.",
  };
}

// Detalhe de uma tarefa: histórico, comentários, checklist e partes. Aceita busca por
// título porque o assistente nunca tem o id na mão.
async function getTaskDetail(squadId: string, args: { title?: string; taskId?: string }) {
  const db = forSquad(squadId);
  const term = (args.title || "").trim();
  const found = args.taskId
    ? await db.task.findUnique({ where: { id: args.taskId }, select: { id: true } })
    : term
    ? await db.task.findFirst({
        where: { title: { contains: term, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
    : null;
  if (!found) return { erro: "Não achei tarefa com esse título." };

  const full = await db.task.findUnique({
    where: { id: found.id },
    select: {
      id: true, title: true, description: true, status: true, priority: true, client: true,
      dueDate: true, dueTime: true, deliverTo: true, source: true, meetingTitle: true,
      recurrence: true, createdAt: true,
      assignee: { select: { name: true } },
      createdBy: { select: { name: true } },
      assignees: {
        select: { isClient: true, role: true, part: true, done: true, user: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      subtasks: { select: { title: true, done: true }, orderBy: { sortOrder: "asc" } },
      links: { select: { url: true, label: true } },
      comments: {
        select: { content: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      activities: {
        select: { type: true, detail: true, userName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      },
    },
  });
  if (!full) return { erro: "Não achei tarefa com esse título." };

  return {
    titulo: full.title,
    descricao: full.description,
    status: full.status,
    prioridade: full.priority,
    cliente: full.client,
    prazo: fmtDay(full.dueDate),
    horario: full.dueTime,
    atrasada: isTaskOverdue(full.dueDate, full.status),
    quemEntrega: full.deliverTo,
    origem: full.source,
    reuniaoDeOrigem: full.meetingTitle,
    recorrencia: full.recurrence,
    criadaPor: full.createdBy?.name ?? null,
    criadaEm: fmtMoment(full.createdAt),
    dono: full.assignee?.name ?? null,
    emConjunto:
      full.assignees.length > 0
        ? full.assignees.map((a) => ({
            quem: a.isClient ? full.client || "Cliente" : a.user?.name ?? null,
            dono: a.role === "principal",
            parte: a.part,
            concluiu: a.done,
          }))
        : undefined,
    checklist: full.subtasks.map((sb) => ({ item: sb.title, feito: sb.done })),
    links: full.links.map((l) => ({ url: l.url, rotulo: l.label })),
    comentarios: full.comments.map((c) => ({
      quem: c.user?.name ?? null,
      quando: fmtMoment(c.createdAt),
      texto: c.content,
    })),
    historico: full.activities.map((a) => ({
      quando: fmtMoment(a.createdAt),
      quem: a.userName,
      oQue: a.detail || a.type,
    })),
  };
}

// Reuniões JÁ REALIZADAS. get_upcoming_meetings só olha pra frente, então "quando foi a
// última reunião com o cliente X" não tinha resposta em lugar nenhum.
async function getMeetingsHistory(
  squadId: string,
  args: { days?: number | string; client?: string; limit?: number | string }
) {
  const db = forSquad(squadId);
  const days = Math.min(Math.max(Number(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
  const since = new Date(Date.now() - days * 86400000);
  const resolvedClient = args.client ? await resolveClientName(db, args.client) : null;

  const events = await db.calendarEvent.findMany({
    where: {
      startAt: { gte: since, lt: new Date() },
      ...(resolvedClient
        ? { client: resolvedClient }
        : args.client
        ? { client: { contains: args.client, mode: "insensitive" } }
        : {}),
    },
    select: { title: true, client: true, startAt: true, meetingType: true },
    orderBy: { startAt: "desc" },
    take: limit,
  });

  const porCliente: Record<string, number> = {};
  for (const e of events) if (e.client) porCliente[e.client] = (porCliente[e.client] || 0) + 1;

  return {
    periodo: `últimos ${days} dias`,
    total: events.length,
    porCliente,
    reunioes: events.map((e) => ({ titulo: e.title, cliente: e.client, data: fmtMoment(e.startAt), tipo: e.meetingType })),
  };
}

// Números do período — o "como estamos indo" que hoje exige abrir o Dashboard e contar.
async function getSquadStats(squadId: string, args: { days?: number | string }) {
  const db = forSquad(squadId);
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 90);
  const { today } = brtNow();
  const since = new Date(today.getTime() - days * 86400000);
  const anterior = new Date(since.getTime() - days * 86400000);

  const [criadas, concluidas, criadasAnterior, concluidasAnterior, abertas] = await Promise.all([
    db.task.count({ where: { createdAt: { gte: since } } }),
    db.task.count({ where: { status: "done", updatedAt: { gte: since } } }),
    db.task.count({ where: { createdAt: { gte: anterior, lt: since } } }),
    db.task.count({ where: { status: "done", updatedAt: { gte: anterior, lt: since } } }),
    db.task.findMany({
      where: { status: { not: "done" } },
      select: { status: true, dueDate: true, client: true, priority: true },
    }),
  ]);

  const porStatus: Record<string, number> = {};
  const porCliente: Record<string, number> = {};
  for (const t of abertas) {
    porStatus[t.status] = (porStatus[t.status] || 0) + 1;
    if (t.client) porCliente[t.client] = (porCliente[t.client] || 0) + 1;
  }
  const topClientes = Object.entries(porCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cliente, abertas]) => ({ cliente, abertas }));

  return {
    periodo: `últimos ${days} dias`,
    criadas,
    concluidas,
    periodoAnterior: { criadas: criadasAnterior, concluidas: concluidasAnterior },
    abertasAgora: abertas.length,
    atrasadasAgora: abertas.filter((t) => isTaskOverdue(t.dueDate, "todo")).length,
    altaPrioridadeAberta: abertas.filter((t) => t.priority === "high").length,
    abertasPorStatus: porStatus,
    clientesComMaisTarefasAbertas: topClientes,
  };
}

// A ÚNICA ferramenta que escreve — e mesmo assim NÃO cria tarefa: cria uma SUGESTÃO
// pendente em /sugestoes-ia, do mesmo jeito que as do n8n e dos Meet Recaps. A regra da
// plataforma continua de pé: a IA nunca age sozinha; quem transforma em tarefa é uma
// pessoa clicando "Adicionar". Passa pela mesma detecção de duplicidade do webhook n8n.
async function proporTarefa(
  squadId: string,
  args: { title?: string; description?: string; client?: string; priority?: string; dueDate?: string },
  ctx: ToolContext
) {
  const db = forSquad(squadId);
  const title = (args.title || "").trim();
  if (!title) return { erro: "Preciso de um título pra propor a tarefa." };

  const resolvedClient = args.client ? (await resolveClientName(db, args.client)) ?? args.client.trim() : null;
  const dueDate = args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) ? new Date(args.dueDate) : null;
  const priority = ["high", "medium", "low"].includes(args.priority || "") ? args.priority! : null;

  const duplicateNote = await findDuplicateNote(squadId, title, resolvedClient, dueDate);

  const suggestion = await db.externalSuggestion.create({
    data: {
      squadId,
      source: "assistente",
      sourceRef: `Assistente de IA · a pedido de ${ctx.userName ?? "alguém do squad"}`,
      title,
      description: args.description?.trim() || null,
      client: resolvedClient,
      priority,
      dueDate,
      status: duplicateNote ? "duplicate" : "pending",
      duplicateNote,
    },
  });

  await log("ai-assistant", `Sugestão de tarefa proposta pelo assistente: "${title}"`, {
    detail: `pedido por ${ctx.userName ?? ctx.userId}`,
  });

  return {
    criada: true,
    aviso: duplicateNote
      ? `Propus, mas entrou na aba Duplicadas: ${duplicateNote}`
      : "Propus como SUGESTÃO pendente. Ela NÃO virou tarefa — precisa ser aceita em /sugestoes-ia.",
    sugestao: {
      titulo: suggestion.title,
      cliente: suggestion.client,
      prioridade: suggestion.priority,
      prazo: fmtDay(suggestion.dueDate),
    },
    onde: "/sugestoes-ia (aba Pendentes)",
  };
}


// ---------------------------------------------------------------------------
// AÇÕES — o assistente saiu de só-leitura em 2026-09-08. Duas faixas, separadas pelo
// custo do erro (não pelo tipo da ação):
//
//   executa direto  → criar tarefa, comentar, item de checklist. Errar é barato: nasce
//                     visível no Kanban e some com um clique.
//   pede confirmação → mexer em tarefa que já existe. Não porque a ação seja perigosa,
//                     mas porque o erro provável é acertar a ação e errar o ALVO.
//
// Apagar não existe como ferramenta, de propósito: excluir cliente faz cascade em 7
// tabelas e excluir tarefa leva junto comentários e histórico. Isso continua sendo
// decisão de tela, com os dois níveis de confirmação que já existem lá.

async function criarTarefa(
  squadId: string,
  args: { title?: string; description?: string; client?: string; priority?: string; dueDate?: string; dueTime?: string; assigneeNames?: string[] | string },
  ctx: ToolContext
) {
  const db = forSquad(squadId);
  const title = (args.title || "").trim();
  if (!title) return { erro: "Preciso de um título pra criar a tarefa." };

  const nomes = Array.isArray(args.assigneeNames)
    ? args.assigneeNames
    : typeof args.assigneeNames === "string" && args.assigneeNames.trim()
    ? [args.assigneeNames]
    : [];

  const people = await db.user.findMany({ select: { id: true, name: true, email: true } });
  const ids: string[] = [];
  for (const nome of nomes) {
    const alvo = (nome || "").trim();
    if (!alvo) continue;
    if (alvo.toLowerCase() === "cliente") { ids.push(CLIENT_CHOICE); continue; }
    const hits = people.filter((u) => (u.name || u.email).toLowerCase().includes(alvo.toLowerCase()));
    if (hits.length === 0) return { erro: `Não achei "${alvo}" no squad. Pergunte pra quem é a tarefa.` };
    if (hits.length > 1) return { erro: `"${alvo}" bate com mais de uma pessoa (${hits.map((h) => h.name).join(", ")}). Pergunte qual.` };
    ids.push(hits[0].id);
  }
  // sem ninguém indicado, a tarefa fica com quem pediu — mesmo padrão da tela
  if (ids.length === 0) ids.push(ctx.userId);

  const validIds = new Set(people.map((u) => u.id));
  const assignees = normalizeAssignees(ids.map((id) => ({ id })), validIds);
  if (!assignees.ok) return { erro: assignees.error };

  const resolvedClient = args.client ? (await resolveClientName(db, args.client)) ?? args.client.trim() : null;
  const dueDate = args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) ? new Date(args.dueDate) : null;
  if (args.dueDate && !dueDate) return { erro: `Prazo inválido: use YYYY-MM-DD (recebi "${args.dueDate}")` };
  const dueTime = args.dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(args.dueTime) ? args.dueTime : null;

  const task = await db.task.create({
    data: {
      squadId,
      title,
      description: args.description?.trim() || null,
      priority: PRIORITIES_OK.includes(args.priority || "") ? args.priority! : "medium",
      assigneeId: assignees.joint ? assignees.principalUserId : assignees.principalUserId,
      createdById: ctx.userId,
      dueDate,
      dueTime,
      client: resolvedClient,
      deliverTo: !assignees.joint && assignees.clientOnly ? "o2" : null,
      source: "assistente",
    },
    include: { assignee: { select: { name: true } } },
  });

  if (assignees.ok && assignees.joint) await syncTaskAssignees(db, task.id, assignees);

  await db.taskActivity.create({
    data: { taskId: task.id, userName: `${ctx.userName ?? "Alguém"} (via assistente)`, type: "created", detail: "Criada pelo assistente de IA" },
  }).catch(() => {});

  await log("ai-assistant", `Tarefa criada pelo assistente: "${title}"`, { detail: `por ${ctx.userName ?? ctx.userId}` });
  revalidateTag("tasks", "max");

  return {
    criada: true,
    tarefa: {
      titulo: task.title,
      responsavel: task.assignee?.name ?? (assignees.ok && !assignees.joint && assignees.clientOnly ? "Cliente" : null),
      emConjunto: assignees.ok && assignees.joint ? assignees.rows.length : undefined,
      cliente: task.client,
      prazo: fmtDay(task.dueDate),
      prioridade: task.priority,
    },
    observacao: "A tarefa já está no Kanban. Se estiver errada, dá pra apagar na tela.",
  };
}

async function comentarTarefa(squadId: string, args: { title?: string; comment?: string }, ctx: ToolContext) {
  const texto = (args.comment || "").trim();
  if (!texto) return { erro: "Preciso do texto do comentário." };

  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  await prisma.taskComment.create({ data: { taskId: alvo.task.id, userId: ctx.userId, content: `${texto}\n\n— via assistente de IA` } });
  revalidateTag("tasks", "max");
  return { comentado: true, tarefa: alvo.task.title, texto };
}

async function adicionarItemChecklist(squadId: string, args: { title?: string; item?: string }, ctx: ToolContext) {
  const item = (args.item || "").trim();
  if (!item) return { erro: "Preciso do texto do item." };

  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  const ultimo = await prisma.subtask.findFirst({ where: { taskId: alvo.task.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await prisma.subtask.create({ data: { taskId: alvo.task.id, title: item, sortOrder: (ultimo?.sortOrder ?? 0) + 1 } });
  await prisma.taskActivity.create({
    data: { taskId: alvo.task.id, userName: `${ctx.userName ?? "Alguém"} (via assistente)`, type: "created", detail: `Item de checklist: "${item}"` },
  }).catch(() => {});
  revalidateTag("tasks", "max");
  return { adicionado: true, tarefa: alvo.task.title, item };
}

// Não altera nada: deixa a mudança PENDENTE e devolve o resumo pro chat mostrar com
// botão de confirmar. Quem executa de fato é POST /api/assistant/actions/[id].
async function alterarTarefa(
  squadId: string,
  args: { title?: string; status?: string; priority?: string; dueDate?: string; dueTime?: string; assigneeName?: string; client?: string },
  ctx: ToolContext
) {
  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  const built = await buildChanges(squadId, alvo.task, args);
  if (!built.ok) return { erro: built.erro };

  const summary = `${alvo.task.title}${alvo.task.client ? ` (${alvo.task.client})` : ""} — ${built.linhas.join("; ")}`;
  ctx.pendingActionId = await createPendingAction(squadId, ctx.userId, "task", alvo.task.id, built.changes, summary);

  return {
    aguardandoConfirmacao: true,
    tarefaResolvida: { titulo: alvo.task.title, cliente: alvo.task.client, status: alvo.task.status },
    vaiMudar: built.linhas,
    instrucao:
      "NÃO diga que já mudou — nada foi alterado ainda. Diga em uma frase qual tarefa você encontrou e o que vai mudar; a pessoa tem um botão Confirmar no chat.",
  };
}

// ---------------------------------------------------------------------------
// Link, checklist e lembrete — executam direto, mesmo critério de comentar_tarefa e
// adicionar_item_checklist (errar aqui é barato).

async function anexarLinkTarefa(squadId: string, args: { title?: string; url?: string; label?: string }) {
  const url = (args.url || "").trim();
  if (!url) return { erro: "Preciso da URL do link." };

  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const link = await prisma.taskLink.create({ data: { taskId: alvo.task.id, url: normalized, label: args.label?.trim() || null } });
  revalidateTag("tasks", "max");
  return { anexado: true, tarefa: alvo.task.title, url: link.url };
}

// Marca/desmarca um item do checklist já existente — resolvido por texto, igual à
// tarefa. Não confunde com adicionar_item_checklist, que CRIA um item novo.
async function marcarItemChecklist(squadId: string, args: { title?: string; item?: string; done?: boolean }) {
  const termoItem = (args.item || "").trim();
  if (!termoItem) return { erro: "Preciso do texto do item do checklist." };

  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  const subtasks = await prisma.subtask.findMany({ where: { taskId: alvo.task.id }, select: { id: true, title: true, done: true } });
  const hits = subtasks.filter((s) => s.title.toLowerCase().includes(termoItem.toLowerCase()));
  if (hits.length === 0) return { erro: `Não achei item de checklist com "${termoItem}" na tarefa "${alvo.task.title}".` };
  if (hits.length > 1) {
    return { erro: `Achei ${hits.length} itens de checklist parecidos com "${termoItem}". Pergunte qual.`, candidatos: hits.map((h) => h.title) };
  }

  // "marcar" é o caso comum, então é o padrão quando `done` vem ausente — SEM alternar
  // automaticamente. Um "toggle" aqui provou ser perigoso: se o modelo esquecer de mandar
  // `done` (acontece) e o item já estiver feito, alternar desmarcaria — o oposto exato do
  // que a pessoa pediu. Só desmarca com `done: false` explícito.
  const done = args.done === false ? false : true;
  await prisma.subtask.update({ where: { id: hits[0].id }, data: { done } });
  revalidateTag("tasks", "max");
  return { marcado: true, tarefa: alvo.task.title, item: hits[0].title, feito: done };
}

// Dispara o mesmo lembrete no Slack que o botão "Lembrar" do painel da tarefa.
async function enviarLembrete(squadId: string, args: { title?: string }, ctx: ToolContext) {
  const alvo = await resolveTarget(squadId, args.title || "");
  if (!alvo.ok) return alvo;

  const db = forSquad(squadId);
  const task = await db.task.findUnique({ where: { id: alvo.task.id } });
  if (!task) return { erro: "A tarefa não existe mais." };
  if (!task.assigneeId) return { erro: `"${task.title}" não tem responsável — não tem pra quem lembrar.` };

  const result = await notifyTaskReminder({
    squadId,
    assigneeDbId: task.assigneeId,
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    client: task.client,
    requestedBy: ctx.userName,
  });
  if (!result.ok) return { erro: result.error };
  return { lembrete: true, tarefa: task.title };
}

// ---------------------------------------------------------------------------
// TRATATIVA — abrir é confirmação-gated (mexe no funil que o squad usa pra reportar
// churn/recuperação), assim como alterar uma já aberta.

async function registrarTratativa(
  squadId: string,
  args: { client?: string; tipo?: string; motivo?: string; descricao?: string; responsavelName?: string; dataPrevistaFinalizacao?: string; problemaNaOxy?: boolean },
  ctx: ToolContext
) {
  const built = await buildTratativaCreate(squadId, args);
  if (!built.ok) return { erro: built.erro };

  const summary = `Abrir tratativa — ${built.linhas.join("; ")}`;
  ctx.pendingActionId = await createPendingAction(squadId, ctx.userId, "tratativa_new", built.input.client, built.input, summary);

  return {
    aguardandoConfirmacao: true,
    vaiCriar: built.linhas,
    instrucao: "NÃO diga que já abriu a tratativa — nada foi criado ainda. Resuma o que vai abrir; a pessoa confirma no chat.",
  };
}

async function alterarTratativa(
  squadId: string,
  args: { client?: string; motivo?: string; status?: string; desfecho?: string; planoDeAcao?: string; dataPrevistaFinalizacao?: string; responsavelName?: string },
  ctx: ToolContext
) {
  const alvo = await resolveTratativa(squadId, args.client || "", args.motivo);
  if (!alvo.ok) return alvo;

  const built = await buildTratativaChanges(squadId, alvo.tratativa, args);
  if (!built.ok) return { erro: built.erro };

  const summary = `Tratativa de ${alvo.tratativa.client} (${alvo.tratativa.motivo}) — ${built.linhas.join("; ")}`;
  ctx.pendingActionId = await createPendingAction(squadId, ctx.userId, "tratativa", alvo.tratativa.id, built.changes, summary);

  return {
    aguardandoConfirmacao: true,
    tratativaResolvida: { cliente: alvo.tratativa.client, motivo: alvo.tratativa.motivo, status: alvo.tratativa.status },
    vaiMudar: built.linhas,
    instrucao: "NÃO diga que já mudou — nada foi alterado ainda. Diga qual tratativa você encontrou e o que vai mudar; a pessoa confirma no chat.",
  };
}

// ---------------------------------------------------------------------------
// CLIENTE — criar é direto (mesmo risco de criar_tarefa: corrigir depois é barato,
// já existem 2 níveis de confirmação na tela pra excluir se sair errado). Editar
// campos que alimentam o dashboard de saúde do squad pede confirmação.

async function criarCliente(squadId: string, args: { client?: string }) {
  const client = (args.client || "").trim();
  if (!client) return { erro: "Preciso do nome do cliente." };

  const db = forSquad(squadId);
  const existing = await knownClientNames(db, squadId);
  const lower = new Set([...existing].map((n) => n.toLowerCase()));
  if (lower.has(client.toLowerCase())) return { erro: `Já existe um cliente chamado "${client}".` };

  const note = await db.clientNote.create({ data: { squadId, client } });
  await removeIgnoredClient(squadId, client);
  revalidateTag("clients", "max");
  revalidateTag("calendar", "max");
  return { criado: true, cliente: note.client };
}

async function editarCliente(
  squadId: string,
  args: { client?: string; status?: string; healthStatus?: string; oxyStage?: string; oxyPendencies?: string; notes?: string },
  ctx: ToolContext
) {
  const alvo = await resolveClientTarget(squadId, args.client || "");
  if (!alvo.ok) return alvo;

  const built = buildClientChanges(alvo.client, args);
  if (!built.ok) return { erro: built.erro };

  const summary = `${alvo.client.client} — ${built.linhas.join("; ")}`;
  ctx.pendingActionId = await createPendingAction(squadId, ctx.userId, "client", alvo.client.id, built.changes, summary);

  return {
    aguardandoConfirmacao: true,
    clienteResolvido: alvo.client.client,
    vaiMudar: built.linhas,
    instrucao: "NÃO diga que já mudou — nada foi alterado ainda. Diga o que vai mudar; a pessoa confirma no chat.",
  };
}

// ---------------------------------------------------------------------------
// GOOGLE CALENDAR — a ação mais sensível do assistente (agenda real, não só espelho
// interno). SEMPRE confirmação, sem exceção, e sem convidado nesta versão.
async function agendarEvento(
  squadId: string,
  args: { title?: string; client?: string; date?: string; time?: string; durationMinutes?: number; description?: string },
  ctx: ToolContext
) {
  const built = buildCalendarEventCreate(args);
  if (!built.ok) return { erro: built.erro };

  const summary = `Agendar no Google Calendar — ${built.linhas.slice(0, 2).join("; ")}`;
  ctx.pendingActionId = await createPendingAction(squadId, ctx.userId, "calendar_new", built.input.title, built.input, summary);

  return {
    aguardandoConfirmacao: true,
    vaiCriar: built.linhas,
    instrucao:
      "NÃO diga que já agendou — nada foi criado ainda, nem na agenda nem no app. Resuma dia/hora/título; a pessoa confirma no chat. Se der erro pedindo reconexão do Google, explique que é preciso reconectar em Configurações e não tente de novo sem a pessoa fazer isso.",
  };
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
          status: { type: ["string", "null"], enum: ["todo", "in_progress", "blocked", "done"], description: "Status da tarefa" },
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
          status: { type: ["string", "null"], enum: ["ativo", "pausado", "encerrado"] },
          healthStatus: { type: ["string", "null"], enum: ["verde", "amarelo", "vermelho"] },
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
          status: { type: ["string", "null"], enum: ["triagem", "em_tratativa", "plano_de_acao", "concluida"] },
          client: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_meet_recaps",
      description:
        "Busca no CONTEÚDO das atas/transcrições das reuniões (Meet Recaps) já sincronizadas. Use pra perguntas sobre o que foi dito, combinado ou decidido em reunião — ex: 'o que ficamos de fazer com a Babyland?', 'já falamos de rebalanceamento com a Allebras?'. Devolve trechos da ata, não o texto inteiro.",
      parameters: {
        type: "object",
        properties: {
          textSearch: { type: "string", description: "O assunto procurado dentro da ata (ex: 'rebalanceamento', 'contrato', 'Oxy')" },
          client: { type: "string", description: "Nome do cliente. A maioria das atas não tem o cliente marcado, então o nome também é procurado dentro do texto." },
          days: { type: ["number", "string"], description: "Olhar só as reuniões dos últimos N dias (padrão: todas)" },
          limit: { type: ["number", "string"], description: "Máximo de reuniões (padrão 5, máximo 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_workload",
      description:
        "Carga de trabalho de cada pessoa do squad: tarefas abertas, atrasadas, de alta prioridade, concluídas nos últimos 7 dias e em quantas tarefas em conjunto ela entra só como participante. Use pra 'quem está sobrecarregado', 'como está a carga do time', 'quantas tarefas o Fulano tem'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task_detail",
      description:
        "Abre UMA tarefa específica com histórico de mudanças, comentários, checklist, links e as partes de cada responsável (quando é tarefa em conjunto). Use quando a pessoa perguntar sobre uma tarefa nominalmente — 'por que a tarefa X travou', 'o que já andou na tarefa Y', 'quem mexeu nela'.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Título ou parte do título da tarefa" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meetings_history",
      description:
        "Reuniões JÁ REALIZADAS (passadas), opcionalmente de um cliente. Use pra 'quando foi a última reunião com X', 'quantas reuniões tivemos esse mês', 'com quem falamos essa semana'. Para reuniões futuras use get_upcoming_meetings.",
      parameters: {
        type: "object",
        properties: {
          days: { type: ["number", "string"], description: "Quantos dias pra trás olhar (padrão 30, máximo 365)" },
          client: { type: "string", description: "Filtrar por cliente" },
          limit: { type: ["number", "string"], description: "Máximo de reuniões (padrão 15, máximo 40)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_squad_stats",
      description:
        "Números do squad no período: tarefas criadas e concluídas, comparação com o período anterior, abertas por status, atrasadas e clientes com mais tarefas abertas. Use pra 'como estamos indo', 'quantas fechamos essa semana', 'estamos melhorando'.",
      parameters: {
        type: "object",
        properties: { days: { type: ["number", "string"], description: "Tamanho do período em dias (padrão 7, máximo 90)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_tarefa",
      description:
        "Propõe uma tarefa como SUGESTÃO pendente em /sugestoes-ia — NÃO cria a tarefa. Alguém do squad precisa aceitar na tela pra virar tarefa de verdade. Use SOMENTE quando a pessoa pedir explicitamente pra criar/propor/anotar uma tarefa. Nunca use por iniciativa própria, nem depois de só relatar um problema. Ao responder, deixe claro que ficou como sugestão esperando aprovação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da tarefa, curto e no imperativo (ex: 'Revisar balancete de agosto')" },
          description: { type: "string", description: "Detalhe do que precisa ser feito" },
          client: { type: "string", description: "Cliente relacionado, se houver" },
          priority: { type: ["string", "null"], enum: ["high", "medium", "low"] },
          dueDate: { type: "string", description: "Prazo no formato YYYY-MM-DD. Use a data de hoje informada no início da conversa como referência." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description:
        "CRIA a tarefa de verdade no Kanban (diferente de propor_tarefa, que só deixa uma sugestão esperando aprovação). Use quando a pessoa pedir claramente pra criar/abrir uma tarefa. Se ela não disser de quem é, a tarefa fica com quem pediu. Nunca invente responsável nem prazo: se não foi dito, deixe em branco.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto, no imperativo (ex: 'Revisar balancete de agosto')" },
          description: { type: "string", description: "Detalhe do que precisa ser feito" },
          client: { type: "string", description: "Cliente relacionado, se houver" },
          priority: { type: ["string", "null"], enum: ["high", "medium", "low"] },
          dueDate: { type: "string", description: "Prazo YYYY-MM-DD, usando a data de hoje informada no início da conversa" },
          dueTime: { type: "string", description: "Horário HH:MM (Brasília), só se a pessoa disser uma hora" },
          assigneeNames: {
            type: "array",
            items: { type: "string" },
            description: "Nomes dos responsáveis. Dois ou mais = tarefa em conjunto, e o primeiro vira o dono. Use 'Cliente' para atribuir ao cliente.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comentar_tarefa",
      description: "Adiciona um comentário numa tarefa existente. O comentário é gravado em nome de quem está conversando, marcado como vindo do assistente.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título ou parte do título da tarefa" },
          comment: { type: "string", description: "Texto do comentário" },
        },
        required: ["title", "comment"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adicionar_item_checklist",
      description: "Adiciona um item ao checklist (subtarefas) de uma tarefa existente.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título ou parte do título da tarefa" },
          item: { type: "string", description: "Texto do item do checklist" },
        },
        required: ["title", "item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "alterar_tarefa",
      description:
        "Prepara uma alteração numa tarefa que JÁ EXISTE (status, prazo, horário, prioridade, responsável, cliente) — inclui concluir e reabrir. NÃO altera na hora: deixa pendente e a pessoa confirma num botão no chat. Uma tarefa por chamada; se pedirem pra mudar várias, trate uma de cada vez. Se a busca por título devolver vários candidatos, PERGUNTE qual antes de tentar de novo — nunca escolha sozinho.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título ou parte do título da tarefa a alterar" },
          status: { type: ["string", "null"], enum: ["todo", "in_progress", "blocked", "done"], description: "'done' conclui, 'todo' reabre" },
          priority: { type: ["string", "null"], enum: ["high", "medium", "low"] },
          dueDate: { type: "string", description: "Novo prazo YYYY-MM-DD, ou string vazia pra tirar o prazo" },
          dueTime: { type: "string", description: "Novo horário HH:MM, ou string vazia pra tirar" },
          assigneeName: { type: "string", description: "Nome do novo responsável, ou string vazia pra deixar sem responsável" },
          client: { type: "string", description: "Novo cliente" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anexar_link_tarefa",
      description: "Anexa um link (URL) numa tarefa existente. Executa direto, sem confirmação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título ou parte do título da tarefa" },
          url: { type: "string", description: "URL do link" },
          label: { type: "string", description: "Rótulo curto pro link (opcional)" },
        },
        required: ["title", "url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_item_checklist",
      description: "Marca ou desmarca um item que JÁ EXISTE no checklist de uma tarefa. Para criar um item novo use adicionar_item_checklist. Executa direto, sem confirmação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título ou parte do título da tarefa" },
          item: { type: "string", description: "Texto ou parte do texto do item do checklist" },
          done: { type: ["boolean", "null"], description: "false = desmarcar. Omitido (ou true) = marcar como feito, que é o caso comum." },
        },
        required: ["title", "item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_lembrete",
      description: "Dispara no Slack, agora, o mesmo lembrete do botão 'Lembrar' da tarefa, pro responsável dela. Executa direto, sem confirmação.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Título ou parte do título da tarefa" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_tratativa",
      description:
        "Prepara a abertura de uma tratativa nova com um cliente (preventiva ou reativa) — NÃO cria na hora, fica pendente com botão Confirmar no chat, porque alimenta o funil de churn/recuperação que o squad reporta.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nome do cliente" },
          tipo: { type: "string", enum: ["preventiva", "reativa"] },
          motivo: { type: "string", description: "O que está acontecendo com o cliente" },
          descricao: { type: "string", description: "Detalhe adicional" },
          responsavelName: { type: "string", description: "Quem do squad vai tocar a tratativa" },
          dataPrevistaFinalizacao: { type: "string", description: "Prazo YYYY-MM-DD" },
          problemaNaOxy: { type: "boolean", description: "Se o problema é relacionado à Oxy" },
        },
        required: ["client", "tipo", "motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "alterar_tratativa",
      description:
        "Prepara uma alteração numa tratativa ABERTA de um cliente (status, desfecho, plano de ação, prazo, responsável) — NÃO altera na hora, fica pendente com botão Confirmar. Se o cliente tiver mais de uma tratativa aberta, o retorno lista os motivos de cada uma: pergunte à pessoa qual e chame de novo passando esse texto em `motivo`.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nome do cliente" },
          motivo: { type: "string", description: "Trecho do motivo, só quando o cliente tem mais de uma tratativa aberta e a pessoa já disse qual" },
          status: { type: ["string", "null"], enum: ["triagem", "em_tratativa", "plano_de_acao", "concluida"] },
          desfecho: { type: ["string", "null"], enum: ["recuperado", "churn", "downsell", "mudanca_escopo", "desistencia"] },
          planoDeAcao: { type: "string" },
          dataPrevistaFinalizacao: { type: "string", description: "YYYY-MM-DD" },
          responsavelName: { type: "string" },
        },
        required: ["client"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_cliente",
      description: "Cadastra um cliente novo na carteira (ainda sem tarefa/reunião). Executa direto, sem confirmação — errar é barato, dá pra excluir na tela.",
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
      name: "editar_cliente",
      description:
        "Prepara uma alteração num cliente que JÁ ESTÁ na carteira (status, saúde da conta, etapa Oxy, pendências, notas) — NÃO altera na hora, fica pendente com botão Confirmar, porque alimenta o dashboard de clientes que o squad inteiro usa. Para cliente novo use criar_cliente.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nome do cliente" },
          status: { type: ["string", "null"], enum: ["ativo", "pausado", "encerrado"] },
          healthStatus: { type: ["string", "null"], enum: ["verde", "amarelo", "vermelho"] },
          oxyStage: { type: ["string", "null"], enum: ["nao_iniciado", "em_validacao", "em_implantacao", "implantacao_interrompida", "ativo"] },
          oxyPendencies: { type: "string", description: "O que falta pro cliente na Oxy" },
          notes: { type: "string", description: "Notas gerais sobre o cliente" },
        },
        required: ["client"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_evento",
      description:
        "Prepara a criação de um evento/reunião no Google Calendar de quem está pedindo — NÃO cria na hora, fica pendente com botão Confirmar, porque vira um compromisso real na agenda da pessoa (diferente de tudo mais no app, que só mexe no Kanban interno). Sem convidado — cria só na agenda de quem confirmar. Use quando a pessoa pedir claramente pra agendar/marcar/colocar algo na agenda.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da reunião/evento" },
          client: { type: "string", description: "Cliente relacionado, se houver" },
          date: { type: "string", description: "Data YYYY-MM-DD, usando a data de hoje informada no início da conversa como referência" },
          time: { type: "string", description: "Horário HH:MM em Brasília" },
          durationMinutes: { type: ["number", "null"], description: "Duração em minutos (padrão 60, máximo 480)" },
          description: { type: "string", description: "Detalhe adicional do evento" },
        },
        required: ["title", "date", "time"],
      },
    },
  },
];




export async function runTool(
  squadId: string,
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  // O Groq costuma preencher parâmetro opcional que não usou com `null` em vez de
  // omitir a chave (e às vezes o próprio validador da Groq rejeita a chamada inteira
  // por isso — os schemas abaixo aceitam null nesses campos exatamente pra evitar
  // esse 400). As funções de cada ferramenta checam `!== undefined` pra saber "isso foi
  // pedido", então sem esta limpeza um `status: null` seria lido como "mude pra null"
  // em vez de "não mexi nisso".
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawArgs)) {
    if (value !== null) args[key] = value;
  }

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
    case "search_meet_recaps":
      return searchMeetRecaps(squadId, args);
    case "get_team_workload":
      return getTeamWorkload(squadId);
    case "get_task_detail":
      return getTaskDetail(squadId, args as { title?: string; taskId?: string });
    case "get_meetings_history":
      return getMeetingsHistory(squadId, args);
    case "get_squad_stats":
      return getSquadStats(squadId, args);
    case "propor_tarefa":
      return proporTarefa(squadId, args, ctx);
    case "criar_tarefa":
      return criarTarefa(squadId, args, ctx);
    case "comentar_tarefa":
      return comentarTarefa(squadId, args, ctx);
    case "adicionar_item_checklist":
      return adicionarItemChecklist(squadId, args, ctx);
    case "alterar_tarefa":
      return alterarTarefa(squadId, args, ctx);
    case "anexar_link_tarefa":
      return anexarLinkTarefa(squadId, args);
    case "marcar_item_checklist":
      return marcarItemChecklist(squadId, args);
    case "enviar_lembrete":
      return enviarLembrete(squadId, args, ctx);
    case "registrar_tratativa":
      return registrarTratativa(squadId, args, ctx);
    case "alterar_tratativa":
      return alterarTratativa(squadId, args, ctx);
    case "criar_cliente":
      return criarCliente(squadId, args);
    case "editar_cliente":
      return editarCliente(squadId, args, ctx);
    case "agendar_evento":
      return agendarEvento(squadId, args, ctx);
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
