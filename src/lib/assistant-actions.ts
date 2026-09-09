import { forSquad } from "./tenant-prisma";
import { prisma } from "./prisma";
import { recordTaskChanges } from "./activity";
import { statusLabel, priorityLabel, brtNow } from "./utils";
import { resolveClientName } from "./client-resolve";
import { log } from "./logger";
import { revalidateTag } from "next/cache";
import { createCalendarEvent } from "./calendar-write";

// Ações do assistente sobre um registro que JÁ EXISTE (tarefa, tratativa) ou que ainda
// vai nascer na confirmação (tratativa nova). Ficam guardadas como AssistantAction
// pendente e só rodam quando alguém clica "Confirmar" no chat.
//
// O motivo de existir esta camada: o erro mais provável do assistente não é escolher a
// ação errada, é errar o ALVO. "Muda o prazo da tarefa do balancete" com três tarefas de
// balancete abertas é o caso típico. Por isso as funções de resolve() se recusam a
// desempatar sozinhas — devolvem a lista pro assistente perguntar qual, em vez de chutar.

export const ACTION_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

// ---------------------------------------------------------------------------
// TAREFA

export type TaskChanges = {
  status?: string;
  priority?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  assigneeId?: string | null;
  client?: string | null;
};

const STATUSES = ["todo", "in_progress", "blocked", "done"];
const PRIORITIES = ["high", "medium", "low"];

type TargetHit = { id: string; title: string; client: string | null; status: string; dueDate: Date | null; assignee: { name: string | null } | null };

export type ResolveResult =
  | { ok: true; task: TargetHit }
  | { ok: false; erro: string; candidatos?: { titulo: string; cliente: string | null; status: string }[] };

// Acha UMA tarefa pelo título. Nunca escolhe por conta própria entre vários candidatos.
export async function resolveTarget(squadId: string, title: string): Promise<ResolveResult> {
  const term = (title || "").trim();
  if (!term) return { ok: false, erro: "Preciso do título da tarefa." };

  const db = forSquad(squadId);
  const select = {
    id: true, title: true, client: true, status: true, dueDate: true,
    assignee: { select: { name: true } },
  } as const;

  const matches = await db.task.findMany({
    where: { title: { contains: term, mode: "insensitive" } },
    select,
    orderBy: { updatedAt: "desc" },
    take: 6,
  });

  if (matches.length === 0) return { ok: false, erro: `Não achei nenhuma tarefa com "${term}" no título.` };

  const exact = matches.filter((m) => m.title.toLowerCase() === term.toLowerCase());
  if (exact.length === 1) return { ok: true, task: exact[0] };

  if (matches.length > 1) {
    return {
      ok: false,
      erro: `Achei ${matches.length} tarefas com "${term}" no título. Pergunte à pessoa qual delas antes de mexer — não escolha sozinho.`,
      candidatos: matches.map((m) => ({ titulo: m.title, cliente: m.client, status: m.status })),
    };
  }

  return { ok: true, task: matches[0] };
}

export async function buildChanges(
  squadId: string,
  task: TargetHit,
  raw: { status?: string; priority?: string; dueDate?: string; dueTime?: string; assigneeName?: string; client?: string }
): Promise<{ ok: true; changes: TaskChanges; linhas: string[] } | { ok: false; erro: string }> {
  const db = forSquad(squadId);
  const changes: TaskChanges = {};
  const linhas: string[] = [];

  if (raw.status !== undefined) {
    if (!STATUSES.includes(raw.status)) return { ok: false, erro: `Status inválido: ${raw.status}` };
    if (raw.status !== task.status) {
      changes.status = raw.status;
      linhas.push(`Status: ${statusLabel(task.status)} → ${statusLabel(raw.status)}`);
    }
  }

  if (raw.priority !== undefined) {
    if (!PRIORITIES.includes(raw.priority)) return { ok: false, erro: `Prioridade inválida: ${raw.priority}` };
    changes.priority = raw.priority;
    linhas.push(`Prioridade → ${priorityLabel(raw.priority)}`);
  }

  if (raw.dueDate !== undefined) {
    if (raw.dueDate === "" || raw.dueDate === null) {
      changes.dueDate = null;
      linhas.push("Prazo → sem prazo");
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)) {
      changes.dueDate = raw.dueDate;
      const antes = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "sem prazo";
      linhas.push(`Prazo: ${antes} → ${raw.dueDate}`);
    } else {
      return { ok: false, erro: `Prazo inválido: use YYYY-MM-DD (recebi "${raw.dueDate}")` };
    }
  }

  if (raw.dueTime !== undefined) {
    if (raw.dueTime === "") {
      changes.dueTime = null;
      linhas.push("Horário → sem horário");
    } else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.dueTime)) {
      changes.dueTime = raw.dueTime;
      linhas.push(`Horário → ${raw.dueTime}`);
    } else {
      return { ok: false, erro: `Horário inválido: use HH:MM (recebi "${raw.dueTime}")` };
    }
  }

  if (raw.assigneeName !== undefined) {
    const nome = raw.assigneeName.trim();
    if (!nome) {
      changes.assigneeId = null;
      linhas.push("Responsável → sem responsável");
    } else {
      const people = await db.user.findMany({ select: { id: true, name: true, email: true } });
      const hits = people.filter((u) => (u.name || u.email).toLowerCase().includes(nome.toLowerCase()));
      if (hits.length === 0) return { ok: false, erro: `Não achei "${nome}" no squad.` };
      if (hits.length > 1) return { ok: false, erro: `"${nome}" bate com mais de uma pessoa (${hits.map((h) => h.name).join(", ")}). Pergunte qual.` };
      changes.assigneeId = hits[0].id;
      linhas.push(`Responsável: ${task.assignee?.name ?? "sem responsável"} → ${hits[0].name ?? hits[0].email}`);
    }
  }

  if (raw.client !== undefined) {
    changes.client = raw.client.trim() || null;
    linhas.push(`Cliente → ${changes.client ?? "sem cliente"}`);
  }

  if (linhas.length === 0) return { ok: false, erro: "Isso não muda nada na tarefa — ela já está assim." };
  return { ok: true, changes, linhas };
}

async function executeTaskAction(
  actionId: string,
  action: { targetId: string; changes: string; summary: string },
  session: { squadId: string; userId: string; userName: string | null }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const db = forSquad(session.squadId);
  const before = await db.task.findUnique({
    where: { id: action.targetId },
    include: { assignee: { select: { id: true, name: true } }, assignees: true },
  });
  if (!before) return { ok: false, erro: "A tarefa não existe mais." };

  const changes = JSON.parse(action.changes) as TaskChanges;

  const task = await db.task.update({
    where: { id: action.targetId },
    data: {
      ...(changes.status !== undefined && { status: changes.status }),
      ...(changes.priority !== undefined && { priority: changes.priority }),
      ...(changes.dueDate !== undefined && { dueDate: changes.dueDate ? new Date(changes.dueDate) : null }),
      ...(changes.dueTime !== undefined && { dueTime: changes.dueTime }),
      ...(changes.assigneeId !== undefined && { assigneeId: changes.assigneeId }),
      ...(changes.client !== undefined && { client: changes.client }),
    },
  });

  // tarefa em conjunto: concluir pelo assistente marca todas as partes, igual ao
  // que a tela faz — senão sobraria tarefa "concluída" com parte pendente
  if (changes.status !== undefined && changes.status !== before.status && before.assignees.length > 0) {
    if (changes.status === "done") {
      await prisma.taskAssignee.updateMany({
        where: { taskId: action.targetId, done: false },
        data: { done: true, doneAt: new Date(), doneById: session.userId },
      });
    } else if (before.status === "done") {
      await prisma.taskAssignee.updateMany({ where: { taskId: action.targetId }, data: { done: false, doneAt: null, doneById: null } });
    }
  }

  let novoResponsavel: string | null = before.assignee?.name ?? null;
  if (changes.assigneeId !== undefined && changes.assigneeId !== before.assigneeId) {
    novoResponsavel = changes.assigneeId
      ? (await db.user.findUnique({ where: { id: changes.assigneeId }, select: { name: true } }))?.name ?? null
      : null;
  }

  await recordTaskChanges(
    action.targetId,
    before,
    changes as Record<string, unknown>,
    `${session.userName ?? "Alguém"} (via assistente)`,
    { before: before.assignee?.name ?? null, after: novoResponsavel }
  ).catch((e) => console.error("[activity]", e));

  revalidateTag("tasks", "max");
  return { ok: true, titulo: task.title, resumo: action.summary };
}

// ---------------------------------------------------------------------------
// TRATATIVA

export type TratativaChanges = {
  status?: string;
  desfecho?: string | null;
  planoDeAcao?: string;
  dataPrevistaFinalizacao?: string | null;
  responsavelId?: string | null;
};

const TRATATIVA_STATUS = ["triagem", "em_tratativa", "plano_de_acao", "concluida"];
const DESFECHOS = ["recuperado", "churn", "downsell", "mudanca_escopo", "desistencia"];
const TIPOS = ["preventiva", "reativa"];

type TratativaHit = { id: string; client: string; motivo: string; status: string; desfecho: string | null; responsavel: { name: string | null } | null };

export type ResolveTratativaResult =
  | { ok: true; tratativa: TratativaHit }
  | { ok: false; erro: string; candidatos?: { cliente: string; motivo: string; status: string }[] };

// Acha a tratativa ABERTA de um cliente (não concluída) — se houver mais de uma, não
// escolhe sozinho, mesma regra do resolveTarget de tarefa.
export async function resolveTratativa(squadId: string, clientTerm: string, motivoHint?: string): Promise<ResolveTratativaResult> {
  const term = (clientTerm || "").trim();
  if (!term) return { ok: false, erro: "Preciso do nome do cliente." };

  const db = forSquad(squadId);
  const resolved = (await resolveClientName(db, term)) ?? term;

  const matches = await db.tratativa.findMany({
    where: { client: { contains: resolved, mode: "insensitive" }, status: { not: "concluida" } },
    select: { id: true, client: true, motivo: true, status: true, desfecho: true, responsavel: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  if (matches.length === 0) return { ok: false, erro: `Não achei tratativa aberta com "${resolved}".` };

  // Cliente com mais de uma tratativa aberta: se a pessoa já deu uma pista do motivo
  // (na primeira pergunta ou numa resposta de acompanhamento), tenta estreitar por ela
  // antes de desistir e perguntar — senão "a que é sobre o prazo de entrega" nunca teria
  // como ser resolvido, e a conversa ficaria pedindo a mesma lista de novo.
  let candidates = matches;
  if (candidates.length > 1 && motivoHint?.trim()) {
    const narrowed = candidates.filter((m) => m.motivo.toLowerCase().includes(motivoHint.trim().toLowerCase()));
    if (narrowed.length > 0) candidates = narrowed;
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      erro: `Achei ${candidates.length} tratativas abertas de "${resolved}". Pergunte qual delas (o motivo distingue) e chame de novo passando esse motivo.`,
      candidatos: candidates.map((m) => ({ cliente: m.client, motivo: m.motivo, status: m.status })),
    };
  }
  return { ok: true, tratativa: candidates[0] };
}

export async function buildTratativaChanges(
  squadId: string,
  tratativa: TratativaHit,
  raw: { status?: string; desfecho?: string; planoDeAcao?: string; dataPrevistaFinalizacao?: string; responsavelName?: string }
): Promise<{ ok: true; changes: TratativaChanges; linhas: string[] } | { ok: false; erro: string }> {
  const db = forSquad(squadId);
  const changes: TratativaChanges = {};
  const linhas: string[] = [];

  if (raw.status !== undefined) {
    if (!TRATATIVA_STATUS.includes(raw.status)) return { ok: false, erro: `Status inválido: ${raw.status}` };
    changes.status = raw.status;
    linhas.push(`Status: ${tratativa.status} → ${raw.status}`);
  }
  if (raw.desfecho !== undefined) {
    if (raw.desfecho && !DESFECHOS.includes(raw.desfecho)) return { ok: false, erro: `Desfecho inválido: ${raw.desfecho}` };
    changes.desfecho = raw.desfecho || null;
    linhas.push(`Desfecho → ${raw.desfecho || "nenhum"}`);
  }
  if (raw.planoDeAcao !== undefined) {
    changes.planoDeAcao = raw.planoDeAcao;
    linhas.push(`Plano de ação → "${raw.planoDeAcao}"`);
  }
  if (raw.dataPrevistaFinalizacao !== undefined) {
    if (raw.dataPrevistaFinalizacao && !/^\d{4}-\d{2}-\d{2}$/.test(raw.dataPrevistaFinalizacao)) {
      return { ok: false, erro: `Data inválida: use YYYY-MM-DD (recebi "${raw.dataPrevistaFinalizacao}")` };
    }
    changes.dataPrevistaFinalizacao = raw.dataPrevistaFinalizacao || null;
    linhas.push(`Prazo → ${raw.dataPrevistaFinalizacao || "sem prazo"}`);
  }
  if (raw.responsavelName !== undefined) {
    const nome = raw.responsavelName.trim();
    if (!nome) {
      changes.responsavelId = null;
      linhas.push("Responsável → sem responsável");
    } else {
      const people = await db.user.findMany({ select: { id: true, name: true, email: true } });
      const hits = people.filter((u) => (u.name || u.email).toLowerCase().includes(nome.toLowerCase()));
      if (hits.length === 0) return { ok: false, erro: `Não achei "${nome}" no squad.` };
      if (hits.length > 1) return { ok: false, erro: `"${nome}" bate com mais de uma pessoa. Pergunte qual.` };
      changes.responsavelId = hits[0].id;
      linhas.push(`Responsável: ${tratativa.responsavel?.name ?? "sem responsável"} → ${hits[0].name ?? hits[0].email}`);
    }
  }

  if (linhas.length === 0) return { ok: false, erro: "Isso não muda nada na tratativa." };
  return { ok: true, changes, linhas };
}

async function executeTratativaAction(
  action: { targetId: string; changes: string; summary: string }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const before = await prisma.tratativa.findUnique({ where: { id: action.targetId } });
  if (!before) return { ok: false, erro: "A tratativa não existe mais." };

  const changes = JSON.parse(action.changes) as TratativaChanges;
  const tratativa = await prisma.tratativa.update({
    where: { id: action.targetId },
    data: {
      ...(changes.status !== undefined && { status: changes.status }),
      ...(changes.desfecho !== undefined && { desfecho: changes.desfecho }),
      ...(changes.planoDeAcao !== undefined && { planoDeAcao: changes.planoDeAcao }),
      ...(changes.dataPrevistaFinalizacao !== undefined && {
        dataPrevistaFinalizacao: changes.dataPrevistaFinalizacao ? new Date(changes.dataPrevistaFinalizacao) : null,
      }),
      ...(changes.responsavelId !== undefined && { responsavelId: changes.responsavelId }),
    },
  });

  revalidateTag("tratativas", "max");
  return { ok: true, titulo: `Tratativa de ${tratativa.client}`, resumo: action.summary };
}

export type TratativaCreateInput = {
  client: string;
  tipo: string;
  motivo: string;
  descricao?: string | null;
  responsavelId?: string | null;
  dataPrevistaFinalizacao?: string | null;
  problemaNaOxy?: boolean;
};

export async function buildTratativaCreate(
  squadId: string,
  raw: { client?: string; tipo?: string; motivo?: string; descricao?: string; responsavelName?: string; dataPrevistaFinalizacao?: string; problemaNaOxy?: boolean }
): Promise<{ ok: true; input: TratativaCreateInput; linhas: string[] } | { ok: false; erro: string }> {
  const db = forSquad(squadId);
  const client = (raw.client || "").trim();
  if (!client) return { ok: false, erro: "Preciso do nome do cliente." };
  const motivo = (raw.motivo || "").trim();
  if (!motivo) return { ok: false, erro: "Preciso do motivo da tratativa." };
  if (!raw.tipo || !TIPOS.includes(raw.tipo)) return { ok: false, erro: `Tipo inválido: use "preventiva" ou "reativa" (recebi "${raw.tipo}")` };

  const resolvedClient = (await resolveClientName(db, client)) ?? client;

  let responsavelId: string | null = null;
  let responsavelNome: string | null = null;
  if (raw.responsavelName?.trim()) {
    const people = await db.user.findMany({ select: { id: true, name: true, email: true } });
    const hits = people.filter((u) => (u.name || u.email).toLowerCase().includes(raw.responsavelName!.trim().toLowerCase()));
    if (hits.length === 0) return { ok: false, erro: `Não achei "${raw.responsavelName}" no squad.` };
    if (hits.length > 1) return { ok: false, erro: `"${raw.responsavelName}" bate com mais de uma pessoa. Pergunte qual.` };
    responsavelId = hits[0].id;
    responsavelNome = hits[0].name ?? hits[0].email;
  }

  if (raw.dataPrevistaFinalizacao && !/^\d{4}-\d{2}-\d{2}$/.test(raw.dataPrevistaFinalizacao)) {
    return { ok: false, erro: `Data inválida: use YYYY-MM-DD (recebi "${raw.dataPrevistaFinalizacao}")` };
  }

  const linhas = [
    `Cliente: ${resolvedClient}`,
    `Tipo: ${raw.tipo}`,
    `Motivo: ${motivo}`,
    ...(responsavelNome ? [`Responsável: ${responsavelNome}`] : []),
    ...(raw.dataPrevistaFinalizacao ? [`Prazo: ${raw.dataPrevistaFinalizacao}`] : []),
  ];

  return {
    ok: true,
    input: {
      client: resolvedClient,
      tipo: raw.tipo,
      motivo,
      descricao: raw.descricao?.trim() || null,
      responsavelId,
      dataPrevistaFinalizacao: raw.dataPrevistaFinalizacao || null,
      problemaNaOxy: !!raw.problemaNaOxy,
    },
    linhas,
  };
}

async function executeTratativaCreate(
  action: { squadId: string; userId: string; changes: string; summary: string }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const input = JSON.parse(action.changes) as TratativaCreateInput;
  const tratativa = await prisma.tratativa.create({
    data: {
      squadId: action.squadId,
      client: input.client,
      tipo: input.tipo,
      motivo: input.motivo,
      descricao: input.descricao ?? null,
      responsavelId: input.responsavelId ?? null,
      dataPrevistaFinalizacao: input.dataPrevistaFinalizacao ? new Date(input.dataPrevistaFinalizacao) : null,
      problemaNaOxy: !!input.problemaNaOxy,
      createdById: action.userId,
    },
  });
  revalidateTag("tratativas", "max");
  return { ok: true, titulo: `Tratativa de ${tratativa.client}`, resumo: action.summary };
}

// ---------------------------------------------------------------------------
// CLIENTE (ClientNote)

export type ClientChanges = {
  status?: string;
  healthStatus?: string;
  oxyStage?: string;
  oxyPendencies?: string | null;
  notes?: string | null;
};

const CLIENT_STATUS = ["ativo", "pausado", "encerrado"];
const HEALTH_STATUS = ["verde", "amarelo", "vermelho"];
const OXY_STAGES = ["nao_iniciado", "em_validacao", "em_implantacao", "implantacao_interrompida", "ativo"];

type ClientHit = { id: string; client: string; status: string; healthStatus: string };

export type ResolveClientResult = { ok: true; client: ClientHit } | { ok: false; erro: string };

export async function resolveClientTarget(squadId: string, name: string): Promise<ResolveClientResult> {
  const term = (name || "").trim();
  if (!term) return { ok: false, erro: "Preciso do nome do cliente." };

  const db = forSquad(squadId);
  const resolved = await resolveClientName(db, term);
  if (!resolved) return { ok: false, erro: `Não achei "${term}" na carteira de clientes. Use criar_cliente se for um cliente novo.` };

  const note = await db.clientNote.findUnique({
    where: { squadId_client: { squadId, client: resolved } },
    select: { id: true, client: true, status: true, healthStatus: true },
  });
  if (!note) return { ok: false, erro: `"${resolved}" ainda não tem ficha na carteira. Use criar_cliente primeiro.` };
  return { ok: true, client: note };
}

export function buildClientChanges(
  client: ClientHit,
  raw: { status?: string; healthStatus?: string; oxyStage?: string; oxyPendencies?: string; notes?: string }
): { ok: true; changes: ClientChanges; linhas: string[] } | { ok: false; erro: string } {
  const changes: ClientChanges = {};
  const linhas: string[] = [];

  if (raw.status !== undefined) {
    if (!CLIENT_STATUS.includes(raw.status)) return { ok: false, erro: `Status inválido: ${raw.status}` };
    changes.status = raw.status;
    linhas.push(`Status: ${client.status} → ${raw.status}`);
  }
  if (raw.healthStatus !== undefined) {
    if (!HEALTH_STATUS.includes(raw.healthStatus)) return { ok: false, erro: `Saúde inválida: ${raw.healthStatus}` };
    changes.healthStatus = raw.healthStatus;
    linhas.push(`Saúde: ${client.healthStatus} → ${raw.healthStatus}`);
  }
  if (raw.oxyStage !== undefined) {
    if (!OXY_STAGES.includes(raw.oxyStage)) return { ok: false, erro: `Etapa Oxy inválida: ${raw.oxyStage}` };
    changes.oxyStage = raw.oxyStage;
    linhas.push(`Etapa Oxy → ${raw.oxyStage}`);
  }
  if (raw.oxyPendencies !== undefined) {
    changes.oxyPendencies = raw.oxyPendencies || null;
    linhas.push(`Pendências Oxy → "${raw.oxyPendencies || "nenhuma"}"`);
  }
  if (raw.notes !== undefined) {
    changes.notes = raw.notes || null;
    linhas.push("Notas atualizadas");
  }

  if (linhas.length === 0) return { ok: false, erro: "Isso não muda nada no cliente." };
  return { ok: true, changes, linhas };
}

async function executeClientAction(
  action: { targetId: string; changes: string; summary: string }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const before = await prisma.clientNote.findUnique({ where: { id: action.targetId } });
  if (!before) return { ok: false, erro: "O cliente não existe mais." };

  const changes = JSON.parse(action.changes) as ClientChanges;
  const note = await prisma.clientNote.update({ where: { id: action.targetId }, data: changes });
  revalidateTag("clients", "max");
  return { ok: true, titulo: note.client, resumo: action.summary };
}

// ---------------------------------------------------------------------------
// EVENTO NO GOOGLE CALENDAR — a ação mais sensível do assistente: acontece na agenda
// REAL da pessoa, não só no espelho interno. Sempre confirmação, sem exceção, e sem
// convidado nesta versão (ver calendar-write.ts pro porquê).

export type CalendarEventCreateInput = {
  title: string;
  client: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  description: string | null;
};

export function buildCalendarEventCreate(
  raw: { title?: string; client?: string; date?: string; time?: string; durationMinutes?: number; description?: string }
): { ok: true; input: CalendarEventCreateInput; linhas: string[] } | { ok: false; erro: string } {
  const title = (raw.title || "").trim();
  if (!title) return { ok: false, erro: "Preciso do título da reunião/evento." };
  if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return { ok: false, erro: `Data inválida: use YYYY-MM-DD (recebi "${raw.date}")` };
  if (!raw.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) return { ok: false, erro: `Horário inválido: use HH:MM (recebi "${raw.time}")` };

  const durationMinutes = Number(raw.durationMinutes) > 0 ? Math.min(Number(raw.durationMinutes), 480) : 60;

  const linhas = [
    `Título: ${title}`,
    `Quando: ${raw.date} às ${raw.time} (${durationMinutes} min)`,
    ...(raw.client ? [`Cliente: ${raw.client}`] : []),
    "Vai criar um evento de verdade na sua agenda do Google, sem convidado.",
  ];

  return { ok: true, input: { title, client: raw.client?.trim() || null, date: raw.date, time: raw.time, durationMinutes, description: raw.description?.trim() || null }, linhas };
}

async function executeCalendarEventCreate(
  action: { userId: string; changes: string; summary: string }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const input = JSON.parse(action.changes) as CalendarEventCreateInput;
  const result = await createCalendarEvent(action.userId, input);
  if (!result.ok) return { ok: false, erro: result.error };
  return { ok: true, titulo: input.title, resumo: action.summary };
}

// ---------------------------------------------------------------------------
// Ciclo de vida comum (executar, cancelar, sobreviver a F5)

export type PendingActionTarget = "task" | "tratativa" | "tratativa_new" | "client" | "calendar_new";

export async function createPendingAction(
  squadId: string,
  userId: string,
  targetType: PendingActionTarget,
  targetId: string,
  changes: unknown,
  summary: string
): Promise<string> {
  const action = await prisma.assistantAction.create({
    data: { squadId, userId, targetType, targetId, changes: JSON.stringify(changes), summary },
  });
  return action.id;
}

// Executa a ação confirmada. Roda escopado no squad de quem pediu e deixa rastro:
// o histórico da tarefa (quando é o caso) registra "Fulano (via assistente)", pra ficar
// óbvio depois o que foi mão humana e o que foi a IA.
export async function executeAction(
  actionId: string,
  session: { squadId: string; userId: string; userName: string | null }
): Promise<{ ok: true; titulo: string; resumo: string } | { ok: false; erro: string }> {
  const action = await prisma.assistantAction.findUnique({ where: { id: actionId } });
  if (!action) return { ok: false, erro: "Ação não encontrada." };
  if (action.userId !== session.userId || action.squadId !== session.squadId) {
    return { ok: false, erro: "Ação não encontrada." };
  }
  if (action.status !== "pending") return { ok: false, erro: "Essa ação já foi resolvida." };
  if (Date.now() - action.createdAt.getTime() > ACTION_MAX_AGE_MS) {
    await prisma.assistantAction.update({ where: { id: actionId }, data: { status: "cancelled", resolvedAt: new Date() } });
    return { ok: false, erro: "Essa ação expirou — peça de novo pro assistente." };
  }

  let result: { ok: true; titulo: string; resumo: string } | { ok: false; erro: string };
  switch (action.targetType) {
    case "task":
      result = await executeTaskAction(actionId, action, session);
      break;
    case "tratativa":
      result = await executeTratativaAction(action);
      break;
    case "tratativa_new":
      result = await executeTratativaCreate({ squadId: action.squadId, userId: action.userId, changes: action.changes, summary: action.summary });
      break;
    case "client":
      result = await executeClientAction(action);
      break;
    case "calendar_new":
      result = await executeCalendarEventCreate({ userId: action.userId, changes: action.changes, summary: action.summary });
      break;
    default:
      result = { ok: false, erro: `Tipo de ação desconhecido: ${action.targetType}` };
  }

  if (!result.ok) return result;

  await prisma.assistantAction.update({ where: { id: actionId }, data: { status: "confirmed", resolvedAt: new Date() } });
  await log("ai-assistant", `Ação confirmada: ${action.summary}`, { detail: `por ${session.userName ?? session.userId}` });

  return result;
}

export async function cancelAction(
  actionId: string,
  session: { squadId: string; userId: string }
): Promise<boolean> {
  const action = await prisma.assistantAction.findUnique({ where: { id: actionId } });
  if (!action || action.userId !== session.userId || action.squadId !== session.squadId || action.status !== "pending") return false;
  await prisma.assistantAction.update({ where: { id: actionId }, data: { status: "cancelled", resolvedAt: new Date() } });
  return true;
}

// Ações ainda esperando confirmação — usado ao recarregar a conversa, pra o botão não
// sumir só porque a pessoa deu F5.
export async function pendingActionsFor(userId: string, squadId: string) {
  const rows = await prisma.assistantAction.findMany({
    where: { userId, squadId, status: "pending", createdAt: { gte: new Date(Date.now() - ACTION_MAX_AGE_MS) } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, summary: true },
  });
  return rows;
}

export function hojeISO(): string {
  return brtNow().today.toISOString().slice(0, 10);
}
