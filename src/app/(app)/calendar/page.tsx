import { getCalendarEvents, getAllTasks } from "@/lib/queries";
import { CalendarGrid } from "@/components/CalendarGrid";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

async function getCalendarData(year: number, month: number) {
  const [events, allTasks] = await Promise.all([
    getCalendarEvents(year, month),
    getAllTasks(),
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
    o2Tasks: deliveryTasks
      .filter(t => t.client === event.client && t.deliverTo === "client")
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        assignee: t.assignee,
      })),
    clientTasks: deliveryTasks
      .filter(t => t.client === event.client && t.deliverTo === "o2")
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        assignee: t.assignee,
      })),
  }));

  // todas as tarefas com prazo no mês visível, independente de cliente/reunião —
  // é o que faz o calendário mostrar "toda tarefa do dia", não só entregas ligadas a reunião
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const tasks = allTasks
    .filter(t => t.dueDate && new Date(t.dueDate) >= monthStart && new Date(t.dueDate) <= monthEnd)
    .map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: new Date(t.dueDate!).toISOString(),
      client: t.client,
      assignee: t.assignee,
    }));

  return { events: eventsWithTasks, tasks };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = parseInt(params.year ?? String(now.getFullYear()));
  const month = parseInt(params.month ?? String(now.getMonth() + 1));

  const { events, tasks } = await getCalendarData(year, month);

  return (
    <div className="p-4 md:p-6 flex flex-col h-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">
          {MONTHS[month - 1]} {year}
        </h1>
        <p className="text-xs text-ink-faint mt-0.5">Reuniões e tarefas do squad, por dia</p>
      </div>
      <CalendarGrid
        year={year}
        month={month}
        events={events}
        tasks={tasks}
      />
    </div>
  );
}
