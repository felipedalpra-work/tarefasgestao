import type { SquadPrisma } from "./tenant-prisma";

// Sentinel já usado na UI (NewTaskModal, sugestões da IA, TaskDetailPanel) pra dizer
// "o responsável é o cliente, não alguém do squad".
export const CLIENT_CHOICE = "__client__";

// Uma tarefa pode ter responsável de duas formas, e as duas continuam valendo:
//
//   1 responsável  → como sempre foi: Task.assigneeId (pessoa) ou assigneeId null +
//                    deliverTo "o2" (cliente). NENHUMA linha em TaskAssignee.
//   2 ou mais      → tarefa em conjunto: uma linha em TaskAssignee por responsável
//                    (inclusive o dono), e Task.assigneeId espelha o dono.
//
// Manter o caso de 1 responsável exatamente como era é de propósito: são ~160 pontos
// do app lendo assigneeId (filtros, digest, prazo, Slack, dashboard, recorrência) que
// seguem funcionando sem tocar em nada. Quem precisa da lista completa chama
// `taskResponsibles()` abaixo, que resolve as duas formas num formato só.

export type AssigneeInput = { id: string; part?: string | null };

export type ResponsibleView = {
  id: string; // userId, ou CLIENT_CHOICE pra parte do cliente
  isClient: boolean;
  isPrincipal: boolean;
  name: string | null;
  image: string | null;
  part: string | null;
  done: boolean;
  assigneeRowId: string | null; // null quando não é tarefa em conjunto (não há o que marcar)
};

type AssigneeRow = {
  id: string;
  userId: string | null;
  isClient: boolean;
  role: string;
  part: string | null;
  done: boolean;
  sortOrder: number;
  user?: { id: string; name: string | null; image: string | null } | null;
};

type TaskShape = {
  assigneeId?: string | null;
  deliverTo?: string | null;
  client?: string | null;
  assignee?: { id: string; name?: string | null; image?: string | null } | null;
  assignees?: AssigneeRow[] | null;
};

// É "em conjunto" quando tem linha de responsável — nunca inferir por assigneeId,
// que também existe nas tarefas de uma pessoa só.
export function isJointTask(task: TaskShape): boolean {
  return (task.assignees?.length ?? 0) > 0;
}

// Lista única de responsáveis, resolvendo as duas formas. É o que a UI deve usar
// pra desenhar avatares, filtros e o checklist de partes — nunca ler assigneeId direto.
export function taskResponsibles(task: TaskShape): ResponsibleView[] {
  const rows = task.assignees ?? [];
  if (rows.length > 0) {
    return [...rows]
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "principal" ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      })
      .map((r) => ({
        id: r.isClient ? CLIENT_CHOICE : r.userId ?? CLIENT_CHOICE,
        isClient: r.isClient,
        isPrincipal: r.role === "principal",
        name: r.isClient ? task.client || "Cliente" : r.user?.name ?? null,
        image: r.isClient ? null : r.user?.image ?? null,
        part: r.part,
        done: r.done,
        assigneeRowId: r.id,
      }));
  }

  if (task.assignee) {
    return [{
      id: task.assignee.id,
      isClient: false,
      isPrincipal: true,
      name: task.assignee.name ?? null,
      image: task.assignee.image ?? null,
      part: null,
      done: false,
      assigneeRowId: null,
    }];
  }

  // convenção antiga de "responsável = Cliente": sem responsável + entrega "o2"
  if (task.deliverTo === "o2") {
    return [{
      id: CLIENT_CHOICE,
      isClient: true,
      isPrincipal: true,
      name: task.client || "Cliente",
      image: null,
      part: null,
      done: false,
      assigneeRowId: null,
    }];
  }

  return [];
}

// A tarefa aparece pra todo responsável — é isso que faz uma tarefa em conjunto
// surgir no Kanban/Tarefas/Semana de cada um, não só do dono.
export function isResponsible(task: TaskShape, userId: string): boolean {
  if (task.assigneeId === userId) return true;
  return (task.assignees ?? []).some((r) => r.userId === userId);
}

export function isClientResponsible(task: TaskShape): boolean {
  if ((task.assignees?.length ?? 0) > 0) return (task.assignees ?? []).some((r) => r.isClient);
  return !task.assigneeId && task.deliverTo === "o2";
}

export type NormalizedAssignees =
  | { ok: false; error: string }
  | { ok: true; joint: false; principalUserId: string | null; clientOnly: boolean }
  | { ok: true; joint: true; principalUserId: string; rows: { userId: string | null; isClient: boolean; role: string; part: string | null; sortOrder: number }[] };

// Regras de quem pode ser o quê, num lugar só:
// - o primeiro da lista é o dono (é dele a cobrança, o e-mail de prazo e o Slack)
// - o dono precisa ser pessoa do squad: o cliente não tem conta pra receber aviso
// - sem repetido, e o cliente entra no máximo uma vez
export function normalizeAssignees(input: AssigneeInput[] | undefined, validUserIds: Set<string>): NormalizedAssignees {
  if (input === undefined) return { ok: true, joint: false, principalUserId: null, clientOnly: false };

  const seen = new Set<string>();
  const clean: AssigneeInput[] = [];
  for (const item of input) {
    const id = (item?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (id !== CLIENT_CHOICE && !validUserIds.has(id)) {
      return { ok: false, error: "Responsável não encontrado no squad" };
    }
    seen.add(id);
    clean.push({ id, part: item.part?.trim() || null });
  }

  if (clean.length === 0) return { ok: true, joint: false, principalUserId: null, clientOnly: false };

  if (clean.length === 1) {
    const only = clean[0];
    if (only.id === CLIENT_CHOICE) return { ok: true, joint: false, principalUserId: null, clientOnly: true };
    return { ok: true, joint: false, principalUserId: only.id, clientOnly: false };
  }

  if (clean[0].id === CLIENT_CHOICE) {
    return { ok: false, error: "O responsável principal precisa ser alguém do squad — o cliente só entra como participante." };
  }

  return {
    ok: true,
    joint: true,
    principalUserId: clean[0].id,
    rows: clean.map((item, i) => ({
      userId: item.id === CLIENT_CHOICE ? null : item.id,
      isClient: item.id === CLIENT_CHOICE,
      role: i === 0 ? "principal" : "participant",
      part: item.part ?? null,
      sortOrder: i,
    })),
  };
}

// Grava a lista de responsáveis da tarefa. Quem já era responsável mantém a parte
// marcada — editar a lista pra adicionar uma pessoa não pode desmarcar o que os
// outros já concluíram.
export async function syncTaskAssignees(
  db: SquadPrisma,
  taskId: string,
  normalized: Extract<NormalizedAssignees, { ok: true }>
): Promise<void> {
  const existing = await db.taskAssignee.findMany({ where: { taskId } });

  if (!normalized.joint) {
    if (existing.length > 0) await db.taskAssignee.deleteMany({ where: { taskId } });
    return;
  }

  const keyOf = (r: { userId: string | null; isClient: boolean }) => (r.isClient ? CLIENT_CHOICE : r.userId ?? "");
  const previous = new Map(existing.map((r) => [keyOf(r), r]));
  const wanted = new Set(normalized.rows.map(keyOf));

  const removed = existing.filter((r) => !wanted.has(keyOf(r)));
  if (removed.length > 0) {
    await db.taskAssignee.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
  }

  for (const row of normalized.rows) {
    const before = previous.get(keyOf(row));
    if (before) {
      await db.taskAssignee.update({
        where: { id: before.id },
        data: { role: row.role, part: row.part, sortOrder: row.sortOrder },
      });
    } else {
      await db.taskAssignee.create({
        data: { taskId, userId: row.userId, isClient: row.isClient, role: row.role, part: row.part, sortOrder: row.sortOrder },
      });
    }
  }
}

// Texto curto de quem é responsável, pra histórico e notificação.
export function describeResponsibles(list: ResponsibleView[]): string {
  if (list.length === 0) return "sem responsável";
  const names = list.map((r) => r.name || (r.isClient ? "Cliente" : "alguém"));
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
