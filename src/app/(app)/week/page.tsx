import Link from "next/link";
import { auth } from "@/lib/auth";
import { getAllTasks } from "@/lib/queries";
import { format, isToday, isTomorrow, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Calendar, CheckCircle2, Circle, Clock, Inbox } from "lucide-react";
import { cn, priorityLabel } from "@/lib/utils";

const STATUS_ICON: Record<string, React.ElementType> = {
  done: CheckCircle2,
  in_progress: Clock,
  blocked: AlertCircle,
  todo: Circle,
};
const STATUS_COLOR: Record<string, string> = {
  done: "text-o2-green",
  in_progress: "text-blue-400",
  blocked: "text-red-400",
  todo: "text-ink-faint",
};
const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-400/10 text-red-400",
  medium: "bg-yellow-400/10 text-yellow-400",
  low: "bg-green-400/10 text-green-400",
};

type Task = Awaited<ReturnType<typeof getAllTasks>>[number];

export default async function WeekPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const allTasks = await getAllTasks();
  const mine = allTasks.filter((t) => t.assigneeId === userId && t.status !== "done");

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const dueTomorrow: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];
  const noDate: Task[] = [];

  for (const t of mine) {
    if (!t.dueDate) { noDate.push(t); continue; }
    const due = new Date(t.dueDate);
    if (due < today) overdue.push(t);
    else if (isToday(due)) dueToday.push(t);
    else if (isTomorrow(due)) dueTomorrow.push(t);
    else if (differenceInCalendarDays(due, today) <= 7) thisWeek.push(t);
    else later.push(t);
  }

  const byDue = (a: Task, b: Task) =>
    new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime();
  [overdue, dueToday, dueTomorrow, thisWeek, later].forEach((arr) => arr.sort(byDue));

  const sections = [
    { title: "Atrasadas", tasks: overdue, accent: "text-red-400", urgent: true },
    { title: "Hoje", tasks: dueToday, accent: "text-o2-green" },
    { title: "Amanhã", tasks: dueTomorrow, accent: "text-blue-400" },
    { title: "Esta semana", tasks: thisWeek, accent: "text-ink-soft" },
    { title: "Mais adiante", tasks: later, accent: "text-ink-mid" },
    { title: "Sem prazo", tasks: noDate, accent: "text-ink-dim" },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Minha Semana</h1>
        <p className="text-ink-mid text-sm mt-1">
          {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })} · {mine.length} tarefa{mine.length !== 1 ? "s" : ""} em aberto
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-20 text-ink-faint">
          <Inbox size={28} className="mx-auto mb-3 text-surface-3" />
          <p className="text-sm">Nada em aberto. Semana limpa ✨</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className={cn("text-xs font-bold uppercase tracking-widest", section.accent)}>
                  {section.title}
                </h2>
                <span className="text-xs text-ink-faint">{section.tasks.length}</span>
                {section.urgent && <AlertCircle size={12} className="text-red-400" />}
              </div>
              <div className="space-y-1.5">
                {section.tasks.map((t) => {
                  const Icon = STATUS_ICON[t.status] ?? Circle;
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks?task=${t.id}`}
                      className={cn(
                        "flex items-center gap-3 bg-surface border rounded-xl px-4 py-3 transition-all hover:border-o2-green/30",
                        section.urgent ? "border-red-500/20" : "border-surface-3"
                      )}
                    >
                      <Icon size={15} className={cn("shrink-0", STATUS_COLOR[t.status])} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{t.title}</p>
                        {t.client && <p className="text-[10px] text-ink-faint mt-0.5">{t.client}</p>}
                      </div>
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0",
                        PRIORITY_BADGE[t.priority] ?? "bg-surface-3 text-ink-mid"
                      )}>
                        {priorityLabel(t.priority)}
                      </span>
                      {t.dueDate && (
                        <span className={cn(
                          "flex items-center gap-1 text-xs shrink-0",
                          section.urgent ? "text-red-400" : "text-ink-dim"
                        )}>
                          <Calendar size={11} />
                          {format(new Date(t.dueDate), "dd MMM", { locale: ptBR })}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
