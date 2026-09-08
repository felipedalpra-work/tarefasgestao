import { forSquad } from "./tenant-prisma";
import { prisma } from "./prisma";
import { recordTaskChanges } from "./activity";
import { statusLabel, priorityLabel, brtNow } from "./utils";
import { log } from "./logger";

// Ações do assistente sobre uma tarefa que JÁ EXISTE. Ficam guardadas como
// AssistantAction pendente e só rodam quando alguém clica "Confirmar" no chat.
//
// O motivo de existir esta camada: o erro mais provável do assistente não é escolher a
// ação errada, é acertar a ação e errar o ALVO. "Muda o prazo da tarefa do balancete"
// com três tarefas de balancete abertas é o caso típico. Por isso resolveTarget() se
// recusa a adivinhar quando há mais de um candidato — devolve a lista pro assistente
// perguntar qual, em vez de chutar.

export const ACTION_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

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

  // título idêntico desempata sozinho — é escolha exata da pessoa, não chute
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

// Valida e normaliza o que foi pedido, e monta o texto que a pessoa vai ler antes de
// confirmar. Devolve erro quando não sobrou nada válido pra mudar.
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

// Executa a ação confirmada. Roda escopado no squad de quem pediu e deixa rastro:
// o histórico da tarefa registra "Fulano (via assistente)", pra ficar óbvio depois o
// que foi mão humana e o que foi a IA.
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

  const db = forSquad(session.squadId);
  const before = await db.task.findUnique({
    where: { id: action.taskId },
    include: { assignee: { select: { id: true, name: true } }, assignees: true },
  });
  if (!before) return { ok: false, erro: "A tarefa não existe mais." };

  const changes = JSON.parse(action.changes) as TaskChanges;

  const task = await db.task.update({
    where: { id: action.taskId },
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
        where: { taskId: action.taskId, done: false },
        data: { done: true, doneAt: new Date(), doneById: session.userId },
      });
    } else if (before.status === "done") {
      await prisma.taskAssignee.updateMany({ where: { taskId: action.taskId }, data: { done: false, doneAt: null, doneById: null } });
    }
  }

  let novoResponsavel: string | null = before.assignee?.name ?? null;
  if (changes.assigneeId !== undefined && changes.assigneeId !== before.assigneeId) {
    novoResponsavel = changes.assigneeId
      ? (await db.user.findUnique({ where: { id: changes.assigneeId }, select: { name: true } }))?.name ?? null
      : null;
  }

  await recordTaskChanges(
    action.taskId,
    before,
    changes as Record<string, unknown>,
    `${session.userName ?? "Alguém"} (via assistente)`,
    { before: before.assignee?.name ?? null, after: novoResponsavel }
  ).catch((e) => console.error("[activity]", e));

  await prisma.assistantAction.update({ where: { id: actionId }, data: { status: "confirmed", resolvedAt: new Date() } });
  await log("ai-assistant", `Ação confirmada: ${action.summary}`, { detail: `tarefa "${task.title}" · por ${session.userName ?? session.userId}` });

  return { ok: true, titulo: task.title, resumo: action.summary };
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

// Usado pelo tool de alterar: hoje em Brasília, pra descrever prazo relativo no resumo.
export function hojeISO(): string {
  return brtNow().today.toISOString().slice(0, 10);
}
