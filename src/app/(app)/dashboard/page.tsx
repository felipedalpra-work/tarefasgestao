import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getAllTasks, getUsers, getClientsOverview } from "@/lib/queries";
import { UserAvatar } from "@/components/UserAvatar";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Circle,
  TrendingUp,
  BarChart2,
  Building2,
  Flame,
  ArrowRight,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn, dueDateOnly, isTaskOverdue } from "@/lib/utils";

async function getStats(squadId: string, userId: string) {
  const [allTasks, users, clients] = await Promise.all([getAllTasks(squadId), getUsers(squadId), getClientsOverview(squadId)]);
  const myTasks = allTasks.filter((t) => t.assigneeId === userId);

  // produtividade dos últimos 7 dias
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const productivity = users.map(u => {
    const uTasks = allTasks.filter(t => t.assigneeId === u.id);
    const completedThisWeek = uTasks.filter(t => t.status === "done" && new Date(t.updatedAt) >= weekAgo).length;
    const open = uTasks.filter(t => t.status !== "done").length;
    const overdue = uTasks.filter(t => isTaskOverdue(t.dueDate, t.status)).length;
    return { user: u, completedThisWeek, open, overdue, total: uTasks.length };
  });

  const topClients = clients.filter(c => c.openTasks > 0).sort((a, b) => b.openTasks - a.openTasks).slice(0, 5);
  const maxClientTasks = Math.max(...topClients.map(c => c.openTasks), 1);

  return { myTasks, allTasks, users, productivity, topClients, maxClientTasks };
}

const statusConfig = {
  todo: { label: "A fazer", icon: Circle, color: "text-ink-mid", chip: "bg-white/5 ring-white/10", glow: "from-white/[0.04]" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-blue-400", chip: "bg-blue-400/10 ring-blue-400/20", glow: "from-blue-400/[0.07]" },
  blocked: { label: "Bloqueado", icon: AlertCircle, color: "text-red-400", chip: "bg-red-400/10 ring-red-400/20", glow: "from-red-400/[0.07]" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-o2-green", chip: "bg-o2-green/10 ring-o2-green/20", glow: "from-o2-green/[0.07]" },
};

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "relative bg-surface/80 border border-white/[0.06] rounded-2xl p-5 md:p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({ icon: Icon, iconClass, title, action }: { icon: LucideIcon; iconClass: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span className={cn("grid place-items-center w-7 h-7 rounded-lg ring-1", iconClass)}>
        <Icon size={14} />
      </span>
      <h2 className="text-[13px] font-semibold text-ink tracking-wide">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[76px] h-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-3" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className="text-o2-green drop-shadow-[0_0_6px_rgba(107,241,105,0.45)]"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-ink">{pct}%</span>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = session.user.id;
  const { myTasks, allTasks, productivity, topClients, maxClientTasks, users } = await getStats(session.user.squadId, userId);

  const counts = {
    todo: myTasks.filter((t) => t.status === "todo").length,
    in_progress: myTasks.filter((t) => t.status === "in_progress").length,
    blocked: myTasks.filter((t) => t.status === "blocked").length,
    done: myTasks.filter((t) => t.status === "done").length,
  };
  const openCount = counts.todo + counts.in_progress + counts.blocked;
  const myOverdue = myTasks.filter((t) => isTaskOverdue(t.dueDate, t.status)).length;
  const completionPct = myTasks.length > 0 ? Math.round((counts.done / myTasks.length) * 100) : 0;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // seção acionável: atrasadas + vencendo em até 2 dias
  const needsAttention = myTasks
    .filter((t) => t.status !== "done" && t.dueDate)
    .filter((t) => differenceInCalendarDays(dueDateOnly(t.dueDate!), today) <= 2)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 6);

  const recentTasks = allTasks.slice(0, 6);
  const firstName = session?.user?.name?.split(" ")[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-green-wash via-surface to-surface p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-o2-green/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-o2-green/80">
              {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold text-ink tracking-tight">
              {greeting}, {firstName} ✌️
            </h1>
            <p className="mt-2 text-sm text-ink-mid">
              Você tem <span className="text-ink font-semibold">{openCount}</span> tarefa{openCount !== 1 ? "s" : ""} em aberto
              {myOverdue > 0 ? (
                <>
                  {" "}e <span className="text-red-400 font-semibold">{myOverdue} atrasada{myOverdue !== 1 ? "s" : ""}</span>.
                </>
              ) : (
                <> — nenhuma atrasada. ✨</>
              )}
            </p>
            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <Link
                href="/week"
                className="inline-flex items-center gap-1.5 rounded-lg bg-o2-green px-3.5 py-2 text-xs font-semibold text-black hover:bg-o2-green-bright transition-colors shadow-[0_0_20px_-6px_rgba(107,241,105,0.6)]"
              >
                Minha semana <ArrowRight size={13} />
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-black/20 border border-white/[0.06] px-4 py-3 backdrop-blur-sm">
            <ProgressRing pct={completionPct} />
            <div>
              <p className="text-xs text-ink-mid">Suas tarefas concluídas</p>
              <p className="text-lg font-bold text-ink">
                {counts.done}
                <span className="text-ink-faint font-medium text-sm"> / {myTasks.length}</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {(Object.entries(statusConfig) as [keyof typeof counts, (typeof statusConfig)["todo"]][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = counts[key];
          const share = myTasks.length > 0 ? Math.round((count / myTasks.length) * 100) : 0;
          return (
            <Link
              key={key}
              href={`/tasks?status=${key}`}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b to-surface p-4 md:p-5 transition-all hover:-translate-y-0.5 hover:border-white/[0.12]",
                cfg.glow,
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("grid place-items-center w-8 h-8 rounded-lg ring-1", cfg.chip)}>
                  <Icon size={15} className={cfg.color} />
                </span>
                <span className="text-[11px] text-ink-faint tabular-nums">{share}%</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-ink tabular-nums tracking-tight">{count}</p>
              <p className="mt-0.5 text-xs text-ink-mid">{cfg.label}</p>
            </Link>
          );
        })}
      </div>

      {/* Precisa de atenção */}
      {needsAttention.length > 0 && (
        <Card className="border-red-500/20 bg-gradient-to-br from-red-500/[0.05] to-surface/80">
          <CardHeader
            icon={Flame}
            iconClass="bg-red-400/10 ring-red-400/20 text-red-400"
            title="Precisa de atenção"
            action={<span className="text-[11px] text-ink-faint">{needsAttention.length} tarefa{needsAttention.length !== 1 ? "s" : ""}</span>}
          />
          <div className="grid sm:grid-cols-2 gap-2">
            {needsAttention.map((t) => {
              const due = dueDateOnly(t.dueDate!);
              const isOverdue = due < today;
              const daysDiff = differenceInCalendarDays(due, today);
              const dueLabel = isOverdue
                ? `há ${Math.abs(daysDiff)} dia${Math.abs(daysDiff) !== 1 ? "s" : ""}`
                : daysDiff === 0 ? "hoje" : daysDiff === 1 ? "amanhã" : `em ${daysDiff} dias`;
              return (
                <Link
                  key={t.id}
                  href={`/tasks?task=${t.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.04] bg-surface-2/70 hover:bg-surface-3 hover:border-white/[0.08] px-3.5 py-3 transition-colors"
                >
                  <span
                    className={cn(
                      "w-1 self-stretch rounded-full shrink-0",
                      isOverdue ? "bg-red-400" : "bg-yellow-400",
                    )}
                  />
                  <span className="text-sm text-ink truncate flex-1 group-hover:text-white">{t.title}</span>
                  <span
                    className={cn(
                      "text-[11px] shrink-0 font-semibold rounded-full px-2 py-0.5 ring-1",
                      isOverdue ? "text-red-300 bg-red-400/10 ring-red-400/20" : "text-yellow-300 bg-yellow-400/10 ring-yellow-400/20",
                    )}
                  >
                    {dueLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Squad members */}
        <Card>
          <CardHeader icon={TrendingUp} iconClass="bg-o2-green/10 ring-o2-green/20 text-o2-green" title="Squad" />
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
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-ink truncate">{u.name || u.email}</p>
                      <span className="text-xs text-ink-mid tabular-nums shrink-0">
                        <span className="text-ink font-semibold">{pct}%</span> · {done}/{total}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-o2-green/60 to-o2-green transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader icon={Activity} iconClass="bg-white/5 ring-white/10 text-ink-soft" title="Atividade recente" />
          {recentTasks.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-8">Nenhuma tarefa ainda</p>
          ) : (
            <ol className="relative">
              <span className="absolute left-[13px] top-2 bottom-2 w-px bg-surface-3" aria-hidden />
              {recentTasks.map((t) => {
                const cfg = statusConfig[t.status as keyof typeof statusConfig] || statusConfig.todo;
                const Icon = cfg.icon;
                return (
                  <li key={t.id}>
                    <Link href={`/tasks?task=${t.id}`} className="group relative flex items-start gap-3 rounded-lg py-2 pr-2 hover:bg-white/[0.02] transition-colors">
                      <span className={cn("relative z-10 grid place-items-center w-[27px] h-[27px] rounded-full ring-1 bg-surface shrink-0", cfg.chip)}>
                        <Icon size={13} className={cfg.color} />
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-sm text-ink truncate group-hover:text-o2-green transition-colors">{t.title}</p>
                        <p className="text-xs text-ink-faint mt-0.5">
                          {t.assignee?.name?.split(" ")[0] || "Sem responsável"} · {cfg.label} ·{" "}
                          {format(new Date(t.updatedAt), "dd MMM", { locale: ptBR })}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {/* Productivity section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Per-person weekly stats */}
        <Card>
          <CardHeader
            icon={BarChart2}
            iconClass="bg-blue-400/10 ring-blue-400/20 text-blue-400"
            title="Produtividade — 7 dias"
            action={
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-ink-faint">
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-o2-green" />concluídas</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-blue-400" />abertas</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-red-400" />atrasadas</span>
              </div>
            }
          />
          <div className="space-y-4">
            {productivity.map((p, i) => {
              const onTime = Math.max(p.open - p.overdue, 0);
              const sum = Math.max(p.completedThisWeek + onTime + p.overdue, 1);
              return (
                <div key={p.user.id} className="flex items-center gap-3">
                  <UserAvatar name={p.user.name} image={p.user.image} size="sm" index={i} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink truncate">{p.user.name?.split(" ")[0] || p.user.email}</span>
                      <span className="flex items-center gap-2.5 text-xs tabular-nums shrink-0">
                        <span className="text-o2-green font-semibold" title="Concluídas em 7 dias">{p.completedThisWeek}</span>
                        <span className="text-blue-400 font-semibold" title="Em aberto">{p.open}</span>
                        <span className={cn("font-semibold", p.overdue > 0 ? "text-red-400" : "text-ink-ghost")} title="Atrasadas">{p.overdue}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex h-2 gap-0.5 rounded-full overflow-hidden bg-surface-3">
                      {p.completedThisWeek > 0 && <div className="bg-o2-green" style={{ width: `${(p.completedThisWeek / sum) * 100}%` }} />}
                      {onTime > 0 && <div className="bg-blue-400" style={{ width: `${(onTime / sum) * 100}%` }} />}
                      {p.overdue > 0 && <div className="bg-red-400" style={{ width: `${(p.overdue / sum) * 100}%` }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top clients by open tasks */}
        <Card>
          <CardHeader icon={Building2} iconClass="bg-violet-400/10 ring-violet-400/20 text-violet-300" title="Clientes com mais tarefas" />
          {topClients.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-8">Nenhuma tarefa aberta por cliente</p>
          ) : (
            <div className="space-y-2">
              {topClients.map((c, idx) => (
                <Link
                  key={c.name}
                  href={`/clientes/${encodeURIComponent(c.name)}`}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className={cn(
                      "grid place-items-center w-6 h-6 rounded-md text-[11px] font-bold tabular-nums shrink-0",
                      idx === 0 ? "bg-violet-400/15 text-violet-300" : "bg-surface-3 text-ink-mid",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-ink truncate group-hover:text-o2-green transition-colors">{c.name}</span>
                      <span className="text-xs font-semibold text-ink-soft ml-2 tabular-nums">{c.openTasks}</span>
                    </div>
                    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500/60 to-violet-300"
                        style={{ width: `${Math.round((c.openTasks / maxClientTasks) * 100)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
