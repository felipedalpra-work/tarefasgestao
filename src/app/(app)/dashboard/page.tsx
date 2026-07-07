import Link from "next/link";
import { auth } from "@/lib/auth";
import { getAllTasks, getUsers, getClientsOverview } from "@/lib/queries";
import { UserAvatar } from "@/components/UserAvatar";
import { DeadlineCheckButton } from "@/components/DeadlineCheckButton";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, AlertCircle, Circle, TrendingUp, BarChart2, Building2, Flame, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

async function getStats(userId: string) {
  const [allTasks, users, clients] = await Promise.all([getAllTasks(), getUsers(), getClientsOverview()]);
  const myTasks = allTasks.filter((t) => t.assigneeId === userId);

  // produtividade dos últimos 7 dias
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const productivity = users.map(u => {
    const uTasks = allTasks.filter(t => t.assigneeId === u.id);
    const completedThisWeek = uTasks.filter(t => t.status === "done" && new Date(t.updatedAt) >= weekAgo).length;
    const open = uTasks.filter(t => t.status !== "done").length;
    const overdue = uTasks.filter(t => t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date()).length;
    return { user: u, completedThisWeek, open, overdue, total: uTasks.length };
  });

  const topClients = clients.filter(c => c.openTasks > 0).sort((a, b) => b.openTasks - a.openTasks).slice(0, 5);
  const maxClientTasks = Math.max(...topClients.map(c => c.openTasks), 1);

  return { myTasks, allTasks, users, productivity, topClients, maxClientTasks };
}

const statusConfig = {
  todo: { label: "A fazer", icon: Circle, color: "text-ink-mid" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-blue-400" },
  blocked: { label: "Bloqueado", icon: AlertCircle, color: "text-red-400" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-o2-green" },
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const { myTasks, allTasks, productivity, topClients, maxClientTasks, users } = await getStats(userId);

  const counts = {
    todo: myTasks.filter((t) => t.status === "todo").length,
    in_progress: myTasks.filter((t) => t.status === "in_progress").length,
    blocked: myTasks.filter((t) => t.status === "blocked").length,
    done: myTasks.filter((t) => t.status === "done").length,
  };

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // seção acionável: atrasadas + vencendo em até 2 dias
  const needsAttention = myTasks
    .filter((t) => t.status !== "done" && t.dueDate)
    .filter((t) => differenceInCalendarDays(new Date(t.dueDate!), today) <= 2)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 6);

  const recentTasks = allTasks.slice(0, 6);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Olá, {session?.user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-ink-mid mt-1 text-sm">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <DeadlineCheckButton />
      </div>

      {/* Compact stats row */}
      <div className="bg-surface border border-surface-3 rounded-xl px-5 py-4 mb-6 flex items-center gap-6 md:gap-10 flex-wrap">
        {(Object.entries(statusConfig) as [string, typeof statusConfig.todo][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = counts[key as keyof typeof counts];
          return (
            <div key={key} className="flex items-center gap-2.5">
              <Icon size={15} className={cfg.color} />
              <span className="text-xl font-bold text-ink">{count}</span>
              <span className="text-xs text-ink-mid">{cfg.label}</span>
            </div>
          );
        })}
        <Link href="/week" className="ml-auto flex items-center gap-1.5 text-xs text-o2-green hover:text-o2-green-bright font-medium transition-colors">
          Minha semana <ArrowRight size={12} />
        </Link>
      </div>

      {/* Precisa de atenção */}
      {needsAttention.length > 0 && (
        <div className="bg-surface border border-red-500/20 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={15} className="text-red-400" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Precisa de atenção</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {needsAttention.map((t) => {
              const due = new Date(t.dueDate!);
              const isOverdue = due < today;
              const daysDiff = differenceInCalendarDays(due, today);
              const dueLabel = isOverdue
                ? `há ${Math.abs(daysDiff)} dia${Math.abs(daysDiff) !== 1 ? "s" : ""}`
                : daysDiff === 0 ? "hoje" : daysDiff === 1 ? "amanhã" : `em ${daysDiff} dias`;
              return (
                <Link
                  key={t.id}
                  href={`/tasks?task=${t.id}`}
                  className="flex items-center gap-3 bg-surface-2 hover:bg-surface-3 rounded-lg px-3.5 py-2.5 transition-colors"
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isOverdue ? "bg-red-400" : "bg-yellow-400")} />
                  <span className="text-sm text-ink truncate flex-1">{t.title}</span>
                  <span className={cn("text-[11px] shrink-0 font-medium", isOverdue ? "text-red-400" : "text-yellow-400")}>
                    {dueLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Squad members */}
        <div className="bg-surface border border-surface-3 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={15} className="text-o2-green" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Squad</h2>
          </div>
          <div className="space-y-4">
            {users.map((u, i) => {
              const userTasks = allTasks.filter((t) => t.assigneeId === u.id);
              const done = userTasks.filter((t) => t.status === "done").length;
              const total = userTasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={u.id} className="flex items-center gap-3">
                  <UserAvatar name={u.name} image={u.image} size="md" index={i} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink truncate">{u.name || u.email}</p>
                      <span className="text-xs text-ink-mid">{done}/{total}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-o2-green rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-surface border border-surface-3 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-5">
            Atividade Recente
          </h2>
          <div className="space-y-3">
            {recentTasks.map((t) => {
              const cfg = statusConfig[t.status as keyof typeof statusConfig] || statusConfig.todo;
              const Icon = cfg.icon;
              return (
                <Link key={t.id} href={`/tasks?task=${t.id}`} className="flex items-start gap-3 group">
                  <Icon size={14} className={`${cfg.color} mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate group-hover:text-o2-green transition-colors">{t.title}</p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {t.assignee?.name?.split(" ")[0] || "Sem responsável"} ·{" "}
                      {format(new Date(t.updatedAt), "dd MMM", { locale: ptBR })}
                    </p>
                  </div>
                </Link>
              );
            })}
            {recentTasks.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-4">Nenhuma tarefa ainda</p>
            )}
          </div>
        </div>
      </div>

      {/* Productivity section */}
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Per-person weekly stats */}
        <div className="bg-surface border border-surface-3 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Produtividade — 7 dias</h2>
          </div>
          <div className="space-y-5">
            {productivity.map((p, i) => (
              <div key={p.user.id}>
                <div className="flex items-center gap-2 mb-2">
                  <UserAvatar name={p.user.name} image={p.user.image} size="sm" index={i} />
                  <span className="text-sm font-medium text-ink">{p.user.name?.split(" ")[0] || p.user.email}</span>
                  <span className="ml-auto text-xs text-ink-faint">{p.total} total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-o2-green/5 border border-o2-green/10 rounded-lg py-2">
                    <p className="text-lg font-bold text-o2-green">{p.completedThisWeek}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">concluídas</p>
                  </div>
                  <div className="bg-blue-400/5 border border-blue-400/10 rounded-lg py-2">
                    <p className="text-lg font-bold text-blue-400">{p.open}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">em aberto</p>
                  </div>
                  <div className={`border rounded-lg py-2 ${p.overdue > 0 ? "bg-red-400/5 border-red-400/10" : "bg-surface-3/30 border-surface-3"}`}>
                    <p className={`text-lg font-bold ${p.overdue > 0 ? "text-red-400" : "text-ink-faint"}`}>{p.overdue}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">atrasadas</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top clients by open tasks */}
        <div className="bg-surface border border-surface-3 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 size={15} className="text-ink-mid" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Clientes com mais tarefas</h2>
          </div>
          {topClients.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-8">Nenhuma tarefa aberta por cliente</p>
          ) : (
            <div className="space-y-3">
              {topClients.map((c) => (
                <Link key={c.name} href={`/clientes/${encodeURIComponent(c.name)}`} className="block group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-ink truncate group-hover:text-o2-green transition-colors">{c.name}</span>
                    <span className="text-xs font-semibold text-ink-mid ml-2">{c.openTasks}</span>
                  </div>
                  <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400/70 rounded-full"
                      style={{ width: `${Math.round((c.openTasks / maxClientTasks) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
