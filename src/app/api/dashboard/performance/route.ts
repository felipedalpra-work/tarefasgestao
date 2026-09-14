import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forSquad } from "@/lib/tenant-prisma";
import { brtNow, isTaskOverdue } from "@/lib/utils";
import { isResponsible } from "@/lib/task-assignees";

const DAY = 24 * 60 * 60 * 1000;
const MIN_WEEKS = 4;
const MAX_WEEKS = 12;
const DEFAULT_WEEKS = 8;

// Painel de desempenho do squad: velocidade de conclusão (por semana, últimas N
// semanas), taxa de tarefas concluídas no prazo, e carga em aberto por pessoa agora.
// Tudo derivado de dados que já existem (Task/TaskActivity) — nenhum snapshot
// histórico é guardado, então só dá pra tender o que é reconstruível a partir de
// eventos já registrados (conclusões); "atrasadas agora" só existe como retrato do
// momento, não como série histórica.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = forSquad(session.user.squadId);

  const weeksParam = Number(req.nextUrl.searchParams.get("weeks"));
  const weeks = Number.isFinite(weeksParam) ? Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(weeksParam))) : DEFAULT_WEEKS;

  const now = new Date();
  const rangeStart = new Date(now.getTime() - weeks * 7 * DAY);

  const [completions, openTasks, users] = await Promise.all([
    // TaskActivity não tem squadId próprio — fica de fora de SCOPED_MODELS (ver
    // tenant-prisma.ts) e herda o isolamento do Task pai. Sem o filtro explícito por
    // `task.squadId` aqui, vazaria conclusão de tarefa de QUALQUER squad da plataforma.
    db.taskActivity.findMany({
      where: {
        type: "status", createdAt: { gte: rangeStart }, detail: { contains: "onclu", mode: "insensitive" },
        task: { squadId: session.user.squadId },
      },
      select: { createdAt: true, task: { select: { id: true, dueDate: true, status: true } } },
    }),
    db.task.findMany({
      where: { status: { not: "done" } },
      select: {
        id: true, dueDate: true, status: true, assigneeId: true,
        assignees: { select: { id: true, userId: true, isClient: true, role: true, part: true, contactName: true, done: true, sortOrder: true } },
      },
    }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, image: true } }),
  ]);

  // buckets[0] = semana mais recente (últimos 7 dias), buckets[weeks-1] = mais antiga
  const buckets = Array.from({ length: weeks }, () => ({ onTime: 0, late: 0, noDueDate: 0 }));
  const seenTaskIds = new Set<string>();
  for (const c of completions) {
    if (!c.task || c.task.status !== "done" || seenTaskIds.has(c.task.id)) continue;
    const bucketIndex = Math.floor((now.getTime() - c.createdAt.getTime()) / (7 * DAY));
    if (bucketIndex < 0 || bucketIndex >= weeks) continue;
    seenTaskIds.add(c.task.id);
    const bucket = buckets[bucketIndex];
    if (!c.task.dueDate) {
      bucket.noDueDate++;
    } else {
      const completedDay = brtNow(c.createdAt).today;
      if (completedDay.getTime() <= new Date(c.task.dueDate).getTime()) bucket.onTime++;
      else bucket.late++;
    }
  }
  // devolve da mais antiga pra mais nova (esquerda -> direita no gráfico)
  const weeklyChart = [...buckets].reverse().map((b, i) => {
    const weekEnd = new Date(now.getTime() - (weeks - 1 - i) * 7 * DAY);
    return { weekEnd: weekEnd.toISOString(), onTime: b.onTime, late: b.late, noDueDate: b.noDueDate };
  });

  const workload = users
    .map((u) => {
      const mine = openTasks.filter((t) => isResponsible(t, u.id));
      const overdue = mine.filter((t) => isTaskOverdue(t.dueDate, t.status)).length;
      return { userId: u.id, name: u.name, image: u.image, onTrack: mine.length - overdue, overdue, total: mine.length };
    })
    .filter((w) => w.total > 0)
    .sort((a, b) => b.total - a.total);

  const completedThisWeek = buckets[0].onTime + buckets[0].late + buckets[0].noDueDate;
  const completedPrevWeek = weeks > 1 ? buckets[1].onTime + buckets[1].late + buckets[1].noDueDate : null;
  const totalOnTime = buckets.reduce((s, b) => s + b.onTime, 0);
  const totalLate = buckets.reduce((s, b) => s + b.late, 0);
  const onTimeRatio = totalOnTime + totalLate > 0 ? totalOnTime / (totalOnTime + totalLate) : null;
  const overdueNow = openTasks.filter((t) => isTaskOverdue(t.dueDate, t.status)).length;

  return NextResponse.json({
    weeks,
    weeklyChart,
    workload,
    kpis: { completedThisWeek, completedPrevWeek, onTimeRatio, overdueNow, openNow: openTasks.length },
  });
}
