import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCalendarEvents, getAllTasks, getUsers } from "@/lib/queries";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarView } from "@/components/calendar/types";

const VIEWS: CalendarView[] = ["day", "week", "month", "schedule"];

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// mesmo intervalo que CalendarGrid.tsx usa pra desenhar a grade do mês (segunda da
// 1ª semana até domingo da última) — precisa bater, senão reunião de um dia
// esmaecido (de mês vizinho) nunca é buscada do banco pra aparecer ali
function monthGridRange(year: number, month: number): { start: Date; end: Date } {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const start = getMondayOfWeek(firstDay);
  const end = new Date(lastDay);
  const endDow = end.getDay();
  if (endDow !== 0) end.setDate(end.getDate() + (7 - endDow));
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function rangeForView(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (view === "week") {
    const start = getMondayOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  // month e schedule usam a mesma grade (ver monthGridRange)
  return monthGridRange(anchor.getFullYear(), anchor.getMonth() + 1);
}

async function getCalendarData(squadId: string, start: Date, end: Date) {
  const [events, allTasks] = await Promise.all([
    getCalendarEvents(squadId, start, end),
    getAllTasks(squadId),
  ]);

  const clients = new Set(events.map(e => e.client));
  const deliveryTasks = allTasks.filter(
    t => t.client && clients.has(t.client) &&
         (t.deliverTo === "client" || t.deliverTo === "o2") &&
         t.status !== "done"
  );

  const eventsWithTasks = events.map(event => ({
    id: event.id,
    title: event.title,
    client: event.client,
    startAt: new Date(event.startAt).toISOString(),
    endAt: new Date(event.endAt).toISOString(),
    briefingSent: event.briefingSent,
    attendeeUserIds: event.attendeeUserIds,
    o2Tasks: deliveryTasks
      .filter(t => t.client === event.client && t.deliverTo === "client")
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        dueTime: t.dueTime,
        assignee: t.assignee,
      })),
    clientTasks: deliveryTasks
      .filter(t => t.client === event.client && t.deliverTo === "o2")
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        dueTime: t.dueTime,
        assignee: t.assignee,
      })),
  }));

  // todas as tarefas com prazo no intervalo visível, independente de cliente/reunião —
  // é o que faz o calendário mostrar "toda tarefa do dia", não só entregas ligadas a reunião
  const tasks = allTasks
    .filter(t => t.dueDate && new Date(t.dueDate) >= start && new Date(t.dueDate) <= end)
    .map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: new Date(t.dueDate!).toISOString(),
      dueTime: t.dueTime,
      client: t.client,
      assignee: t.assignee,
    }));

  return { events: eventsWithTasks, tasks };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const squadId = session.user.squadId;
  const params = await searchParams;

  const view: CalendarView = VIEWS.includes(params.view as CalendarView) ? (params.view as CalendarView) : "week";

  // link antigo (?year=&month=) ainda funciona — vira o dia 1 daquele mês
  let anchor: Date;
  if (params.date) {
    const [y, m, d] = params.date.split("-").map(Number);
    anchor = new Date(y, (m || 1) - 1, d || 1);
  } else if (params.year || params.month) {
    const now = new Date();
    anchor = new Date(parseInt(params.year ?? String(now.getFullYear())), parseInt(params.month ?? String(now.getMonth() + 1)) - 1, 1);
  } else {
    anchor = new Date();
  }

  const { start, end } = rangeForView(view, anchor);

  const [{ events, tasks }, users] = await Promise.all([
    getCalendarData(squadId, start, end),
    getUsers(squadId),
  ]);

  const anchorParam = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;

  return (
    <div className="p-4 md:p-6 flex flex-col h-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">Calendário</h1>
        <p className="text-xs text-ink-faint mt-0.5">Reuniões e tarefas do squad, por dia</p>
      </div>
      <CalendarGrid view={view} anchorDate={anchorParam} events={events} tasks={tasks} users={users} />
    </div>
  );
}
