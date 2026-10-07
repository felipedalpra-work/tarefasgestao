"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X, ChevronLeft, ChevronRight, Sparkles, CalendarDays, CheckCircle2,
  PartyPopper, Check, Trash2, Loader2, Play, AlertTriangle, Pencil, Plus, CheckCheck,
} from "lucide-react";
import { cn, priorityLabel, priorityColor } from "@/lib/utils";
import { WeeklyReviewTaskRow } from "@/components/WeeklyReviewTaskRow";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { LogoIcon } from "@/components/LogoIcon";
import { toast } from "@/components/Toaster";
import { AssigneePicker } from "@/components/AssigneePicker";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { taskResponsibles, type AssigneeInput } from "@/lib/task-assignees";
import type { TaskListItem, UserOption } from "@/types/task";

type ReviewTask = TaskListItem & { isNew: boolean };

type ReviewSuggestion = {
  id: string;
  kind: "recap" | "external";
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | null;
  sourceLabel: string;
  sourceRef: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
};

type ReviewClient = {
  name: string;
  health: string | null;
  oxyStage: string | null;
  meetings: { id: string; title: string; startAt: string; meetingType: string | null; temperature: string | null }[];
  suggestions: ReviewSuggestion[];
  tasksCompleted: { id: string; title: string; updatedAt: string }[];
  tasksOpen: ReviewTask[];
};

type ReviewData = { windowStart: string; windowDays: number; clients: ReviewClient[]; users: UserOption[] };

// campos da sugestão que dá pra editar antes de virar tarefa (mesmo conjunto da
// edição em Sugestões da IA) — client fica fixo no cliente do slide atual, só o
// responsável (inclusive "o cliente") e os outros campos são editáveis aqui.
type SuggestionEditable = {
  title: string;
  description: string;
  priority: string;
  dueDate: string; // yyyy-mm-dd ou ""
  client: string;
  assignees: AssigneeInput[];
};

function defaultSuggestionEditable(client: ReviewClient, s: ReviewSuggestion): SuggestionEditable {
  return {
    title: s.title,
    description: s.description ?? "",
    priority: s.priority || "medium",
    dueDate: s.dueDate ? s.dueDate.slice(0, 10) : "",
    client: client.name,
    assignees: [],
  };
}

const DONE_STORAGE_PREFIX = "weekly-review-done-";

// chave estável pra semana atual (ano-ISO + semana-ISO) — windowStart da API é um
// recorte rolante (now - N dias) e muda a cada milissegundo, então nunca serviria de
// chave de localStorage sem perder a marcação a cada reload
function weekStorageKey(): string {
  const now = new Date();
  return `${getISOWeekYear(now)}-W${getISOWeek(now)}`;
}

const HEALTH_META: Record<string, { label: string; dot: string; text: string }> = {
  verde: { label: "Saudável", dot: "bg-o2-green", text: "text-o2-green" },
  amarelo: { label: "Atenção", dot: "bg-yellow-400", text: "text-yellow-400" },
  vermelho: { label: "Crítico", dot: "bg-red-400", text: "text-red-400" },
};

const OXY_STAGE_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  em_validacao: "Em validação",
  em_implantacao: "Em implantação",
  implantacao_interrompida: "Implantação interrompida",
  ativo: "Oxy ativo",
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  semanal: "Semanal",
  comite: "Comitê",
  kickoff: "Kickoff",
  setup: "Setup",
  interno: "Interno",
};

const TEMPERATURE_META: Record<string, { label: string; className: string }> = {
  otimo: { label: "Ótimo", className: "text-o2-green bg-o2-green/10" },
  bom: { label: "Bom", className: "text-blue-400 bg-blue-400/10" },
  atencao: { label: "Atenção", className: "text-yellow-400 bg-yellow-400/10" },
  critico: { label: "Crítico", className: "text-red-400 bg-red-400/10" },
};

const STATUS_GROUPS: { id: string; label: string; color: string }[] = [
  { id: "todo", label: "A fazer", color: "border-ink-faint" },
  { id: "in_progress", label: "Em andamento", color: "border-blue-400" },
  { id: "blocked", label: "Bloqueado", color: "border-red-400" },
];

function isClientQuiet(c: ReviewClient): boolean {
  return c.meetings.length === 0 && c.suggestions.length === 0 && c.tasksCompleted.length === 0 && c.tasksOpen.length === 0;
}

// falta responsável OU prazo — é exatamente o que a reunião de sexta existe pra resolver
function needsDecision(t: TaskListItem): boolean {
  return taskResponsibles(t).length === 0 || !t.dueDate;
}

export default function WeeklyReviewPage() {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [doneNames, setDoneNames] = useState<Set<string>>(new Set());
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState<SuggestionEditable | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);

  useEffect(() => {
    fetch("/api/weekly-review")
      .then((r) => r.json())
      .then((json: ReviewData) => {
        setData(json);
        // quais empresas já foram "riscadas" nessa revisão — guardado pela semana-ISO
        // atual, pra sobreviver a reload e só zerar na semana seguinte
        try {
          const raw = localStorage.getItem(DONE_STORAGE_PREFIX + weekStorageKey());
          setDoneNames(new Set(raw ? JSON.parse(raw) : []));
        } catch {
          setDoneNames(new Set());
        }
      })
      .catch(() => toast("Erro ao carregar a revisão semanal", "error"))
      .finally(() => setLoading(false));
  }, []);

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const total = clients.length;
  const current = clients[index] ?? null;

  function persistDone(next: Set<string>) {
    setDoneNames(next);
    try { localStorage.setItem(DONE_STORAGE_PREFIX + weekStorageKey(), JSON.stringify([...next])); } catch {}
  }

  function toggleDone(name: string) {
    const next = new Set(doneNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    persistDone(next);
  }

  // navegar NÃO marca nada como revisado — só o botão "Marcar como concluída"
  // faz isso, de propósito (o squad não quer risco automático ao trocar de empresa)
  const goTo = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(i, total - 1))),
    [total]
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { router.push("/tasks"); return; }
      if (!started) return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, router, started]);

  // resumo geral pra tela de confirmação — dá pra ver de cara o tamanho da reunião antes
  // de entrar no showroom em si
  const overallStats = useMemo(() => {
    return clients.reduce(
      (acc, c) => {
        acc.suggestions += c.suggestions.length;
        acc.needsDecision += c.tasksOpen.filter(needsDecision).length;
        acc.meetings += c.meetings.length;
        acc.completed += c.tasksCompleted.length;
        if (!isClientQuiet(c)) acc.clientsWithSomething += 1;
        return acc;
      },
      { suggestions: 0, needsDecision: 0, meetings: 0, completed: 0, clientsWithSomething: 0 }
    );
  }, [clients]);

  function patchClient(name: string, updater: (c: ReviewClient) => ReviewClient) {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, clients: prev.clients.map((c) => (c.name === name ? updater(c) : c)) };
    });
  }

  function onTaskUpdated(clientName: string, updated: TaskListItem) {
    patchClient(clientName, (c) => {
      if (updated.status === "done") {
        return {
          ...c,
          tasksOpen: c.tasksOpen.filter((t) => t.id !== updated.id),
          tasksCompleted: [{ id: updated.id, title: updated.title, updatedAt: new Date().toISOString() }, ...c.tasksCompleted],
        };
      }
      return { ...c, tasksOpen: c.tasksOpen.map((t) => (t.id === updated.id ? { ...t, ...updated, isNew: t.isNew } : t)) };
    });
  }

  function onTaskDeleted(clientName: string, id: string) {
    patchClient(clientName, (c) => ({ ...c, tasksOpen: c.tasksOpen.filter((t) => t.id !== id) }));
  }

  // painel de detalhe completo (mesmo do Kanban), aberto ao clicar no título de uma
  // tarefa — client vem gravado na própria tarefa, não precisa do `current` do slide
  function handlePanelUpdated(updated: TaskListItem) {
    const clientName = updated.client ?? selectedTask?.client;
    if (clientName) onTaskUpdated(clientName, updated);
    setSelectedTask(updated);
  }

  function handlePanelDeleted(id: string) {
    if (selectedTask?.client) onTaskDeleted(selectedTask.client, id);
    setSelectedTask(null);
  }

  function handlePanelStatusChange(id: string, status: string) {
    if (!selectedTask) return;
    const updated = { ...selectedTask, status };
    setSelectedTask(updated);
    if (selectedTask.client) onTaskUpdated(selectedTask.client, updated);
    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  function startEditSuggestion(client: ReviewClient, s: ReviewSuggestion) {
    setEditingSuggestionId(s.id);
    setSuggestionDraft(defaultSuggestionEditable(client, s));
  }

  function cancelEditSuggestion() {
    setEditingSuggestionId(null);
    setSuggestionDraft(null);
  }

  // sem override: aceita direto como a IA sugeriu (comportamento de sempre). Com
  // override (veio do lápis + "Salvar e adicionar"): usa responsável/prioridade/prazo
  // editados — inclusive "Cliente" como responsável, igual Sugestões da IA.
  async function acceptSuggestion(client: ReviewClient, s: ReviewSuggestion, override?: SuggestionEditable) {
    setActing(s.id);
    const fields = override ?? defaultSuggestionEditable(client, s);
    const commonFields = {
      title: fields.title,
      description: fields.description || null,
      priority: fields.priority || "medium",
      assignees: fields.assignees,
      dueDate: fields.dueDate || null,
      client: fields.client || client.name,
      suggestionEdited: !!override,
    };
    const body =
      s.kind === "recap"
        ? { ...commonFields, source: "meet_recap", sourceRef: s.sourceRef, meetingTitle: s.meetingTitle, meetingDate: s.meetingDate, recapSuggestionId: s.id }
        : { ...commonFields, source: "n8n", sourceRef: s.sourceRef, meetingTitle: s.meetingTitle, meetingDate: s.meetingDate, externalSuggestionId: s.id };

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setActing(null);
    if (res.ok) {
      const created: TaskListItem = await res.json();
      patchClient(client.name, (c) => ({
        ...c,
        suggestions: c.suggestions.filter((x) => x.id !== s.id),
        tasksOpen: [{ ...created, isNew: true }, ...c.tasksOpen],
      }));
      cancelEditSuggestion();
      toast("Sugestão virou tarefa", "success");
    } else {
      toast("Erro ao aceitar a sugestão", "error");
    }
  }

  async function rejectSuggestion(client: ReviewClient, s: ReviewSuggestion) {
    setActing(s.id);
    const url = s.kind === "recap" ? `/api/recaps/${s.sourceRef}/suggestions/${s.id}` : `/api/suggestions/external/${s.id}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    setActing(null);
    if (res.ok) {
      patchClient(client.name, (c) => ({ ...c, suggestions: c.suggestions.filter((x) => x.id !== s.id) }));
      toast("Sugestão descartada", "success");
    } else {
      toast("Erro ao descartar a sugestão", "error");
    }
  }

  const health = current?.health ? HEALTH_META[current.health] : null;

  const progressLabel = useMemo(() => (total > 0 ? `${index + 1} de ${total}` : ""), [index, total]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-deep flex flex-col items-center justify-center gap-4">
        <LogoIcon className="w-12 h-12 text-o2-green animate-logo-breathe" />
        <p className="text-sm text-ink-mid">Preparando a revisão semanal…</p>
      </div>
    );
  }

  if (!data || total === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-deep flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg text-ink">Nenhum cliente na carteira ainda.</p>
        <button onClick={() => router.push("/tasks")} className="text-sm text-o2-green hover:underline">Voltar</button>
      </div>
    );
  }

  const quiet = current ? isClientQuiet(current) : false;

  if (!started) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-deep overflow-hidden flex flex-col items-center justify-center px-6 text-center">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-o2-green/[0.06] blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-[32rem] h-[32rem] rounded-full bg-o2-green/[0.04] blur-3xl" />
        </div>

        <button
          onClick={() => router.push("/tasks")}
          className="absolute top-5 right-6 flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink transition-colors z-10"
        >
          <X size={14} /> Sair (Esc)
        </button>

        <div className="relative z-10 flex flex-col items-center animate-fade-in">
          <LogoIcon className="w-14 h-14 text-o2-green mb-5" />
          <h1 className="text-4xl font-black text-ink tracking-tight">Revisão Semanal</h1>
          <p className="text-ink-mid mt-2 max-w-md">
            {clients.length} clientes na carteira, últimos {data.windowDays} dias corridos.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
            <span className="flex items-center gap-1.5 text-xs text-violet-300 bg-violet-400/10 border border-violet-400/20 rounded-full px-3 py-1.5">
              <Sparkles size={12} /> {overallStats.suggestions} sugestões da IA não vistas
            </span>
            <span className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1.5">
              <AlertTriangle size={12} /> {overallStats.needsDecision} tarefas sem responsável/prazo
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-mid bg-surface-2 border border-surface-3 rounded-full px-3 py-1.5">
              <CalendarDays size={12} /> {overallStats.meetings} reuniões essa semana
            </span>
            <span className="flex items-center gap-1.5 text-xs text-o2-green bg-o2-green/10 border border-o2-green/20 rounded-full px-3 py-1.5">
              <CheckCircle2 size={12} /> {overallStats.completed} concluídas essa semana
            </span>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="flex items-center gap-2 mt-9 bg-o2-green text-bg-deep font-semibold rounded-full px-8 py-3.5 hover:bg-o2-green-bright transition-colors shadow-[0_0_40px_-8px_rgba(107,241,105,0.6)]"
          >
            <Play size={16} fill="currentColor" /> Começar showroom
          </button>
          <p className="text-[11px] text-ink-ghost mt-3">
            {overallStats.clientsWithSomething} de {clients.length} clientes têm algo pra revisar · setas do teclado navegam, Esc sai
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg-deep overflow-hidden flex flex-col">
      {/* fundo com glow sutil, pra dar o efeito "showroom" sem pesar */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-o2-green/[0.06] blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[32rem] h-[32rem] rounded-full bg-o2-green/[0.04] blur-3xl" />
      </div>

      {/* topo */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-4 border-b border-surface-3/60">
        <LogoIcon className="w-6 h-6 text-o2-green shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-widest text-ink-faint font-semibold">Revisão semanal</span>
          <span className="text-[11px] text-ink-ghost">últimos {data.windowDays} dias</span>
        </div>

        <span className="ml-4 text-xs text-ink-mid bg-surface border border-surface-3 rounded-lg px-3 py-1.5">
          {progressLabel}
        </span>

        <button
          onClick={() => router.push("/tasks")}
          className="ml-auto flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink transition-colors"
        >
          <X size={14} /> Sair (Esc)
        </button>
      </div>

      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* empresas na vertical à esquerda — navega à vontade clicando em qualquer uma.
            O risco só aparece quando a pessoa marca manualmente (aqui ou no botão do
            slide) — nunca sozinho ao trocar de empresa */}
        <aside className="hidden sm:flex w-60 shrink-0 flex-col border-r border-surface-3/60 overflow-y-auto py-3 px-2">
          {clients.map((c, i) => {
            const isDone = doneNames.has(c.name);
            return (
              <button
                key={c.name}
                onClick={() => goTo(i)}
                className={cn(
                  "group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                  i === index ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:bg-surface-2 hover:text-ink"
                )}
              >
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggleDone(c.name); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleDone(c.name); } }}
                  title={isDone ? "Marcar como não revisada" : "Marcar como revisada"}
                  className={cn(
                    "shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                    isDone ? "bg-o2-green border-o2-green text-bg-deep" : "border-ink-ghost text-transparent group-hover:border-ink-mid"
                  )}
                >
                  <CheckCheck size={10} />
                </span>
                <span className={cn("truncate flex-1", isDone && "line-through text-ink-ghost")}>{c.name}</span>
                {!isDone && !isClientQuiet(c) && (
                  <span className="shrink-0 text-[10px] bg-o2-green/15 text-o2-green px-1.5 py-0.5 rounded-full">
                    {c.tasksOpen.length + c.suggestions.length}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* slide do cliente atual */}
        {current && (
          <div key={current.name} className="flex-1 overflow-y-auto animate-fade-in">
            <div className="max-w-4xl mx-auto px-6 py-10">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-5xl font-black text-ink tracking-tight">{current.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                {health && (
                  <span className={cn("flex items-center gap-1.5 text-xs font-medium", health.text)}>
                    <span className={cn("w-2 h-2 rounded-full", health.dot)} />
                    {health.label}
                  </span>
                )}
                {current.oxyStage && (
                  <span className="text-xs text-ink-faint bg-surface-2 border border-surface-3 rounded-full px-2.5 py-1">
                    {OXY_STAGE_LABELS[current.oxyStage] ?? current.oxyStage}
                  </span>
                )}
                </div>
              </div>

              {/* só marca concluída quando a pessoa clica aqui — navegar entre empresas
                  não marca nada sozinho, de propósito */}
              <button
                onClick={() => toggleDone(current.name)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 text-xs font-medium rounded-full px-3.5 py-2 border transition-colors",
                  doneNames.has(current.name)
                    ? "bg-o2-green/15 text-o2-green border-o2-green/30"
                    : "bg-surface-2 text-ink-mid border-surface-3 hover:text-ink hover:border-border"
                )}
              >
                <CheckCheck size={14} />
                {doneNames.has(current.name) ? "Revisão concluída" : "Marcar como concluída"}
              </button>
            </div>

            {/* resumo rápido — responde de cara "o que tem aqui" antes de descer pras listas */}
            {!quiet && (
              <div className="flex flex-wrap items-center gap-2 mb-8">
                {current.suggestions.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-violet-300 bg-violet-400/10 border border-violet-400/20 rounded-full px-2.5 py-1">
                    <Sparkles size={11} /> {current.suggestions.length} da IA ainda não vistas
                  </span>
                )}
                {current.tasksOpen.filter(needsDecision).length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-1">
                    <AlertTriangle size={11} /> {current.tasksOpen.filter(needsDecision).length} sem responsável/prazo
                  </span>
                )}
                {current.meetings.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-ink-mid bg-surface-2 border border-surface-3 rounded-full px-2.5 py-1">
                    <CalendarDays size={11} /> {current.meetings.length} reunião{current.meetings.length > 1 ? "ões" : ""}
                  </span>
                )}
                {current.tasksCompleted.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-o2-green bg-o2-green/10 border border-o2-green/20 rounded-full px-2.5 py-1">
                    <CheckCircle2 size={11} /> {current.tasksCompleted.length} concluída{current.tasksCompleted.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {quiet && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <PartyPopper size={32} className="text-o2-green" />
                <p className="text-ink-mid">Nada pra revisar essa semana — pode passar pro próximo.</p>
              </div>
            )}

            {/* sugestões da IA/automação vêm primeiro e com cor própria — é o que
                literalmente ninguém do squad ainda viu, prioridade #1 da reunião */}
            {current.suggestions.length > 0 && (
              <section className="mb-8">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-300 mb-3">
                  <Sparkles size={13} /> Sugestões da IA — ainda não vistas ({current.suggestions.length})
                </h2>
                <div className="space-y-2">
                  {current.suggestions.map((s) => {
                    const isEditing = editingSuggestionId === s.id;
                    return (
                      <div key={s.id} className="bg-violet-400/[0.04] border border-violet-400/25 rounded-lg px-3 py-2.5">
                        {isEditing && suggestionDraft ? (
                          <div className="space-y-2.5">
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Título</label>
                              <input
                                value={suggestionDraft.title}
                                onChange={(e) => setSuggestionDraft((d) => d && { ...d, title: e.target.value })}
                                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Descrição</label>
                              <AutoGrowTextarea
                                value={suggestionDraft.description}
                                onChange={(e) => setSuggestionDraft((d) => d && { ...d, description: e.target.value })}
                                rows={2}
                                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Prioridade</label>
                                <select
                                  value={suggestionDraft.priority}
                                  onChange={(e) => setSuggestionDraft((d) => d && { ...d, priority: e.target.value })}
                                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                                >
                                  <option value="high">Alta</option>
                                  <option value="medium">Média</option>
                                  <option value="low">Baixa</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Prazo</label>
                                <input
                                  type="date"
                                  value={suggestionDraft.dueDate}
                                  onChange={(e) => setSuggestionDraft((d) => d && { ...d, dueDate: e.target.value })}
                                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                                />
                              </div>
                            </div>
                            <AssigneePicker
                              users={data.users}
                              client={suggestionDraft.client}
                              value={suggestionDraft.assignees}
                              onChange={(nextAssignees) => setSuggestionDraft((d) => d && { ...d, assignees: nextAssignees })}
                              compact
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button onClick={cancelEditSuggestion} className="text-xs px-3 py-1.5 text-ink-dim hover:text-ink transition-colors">
                                Cancelar
                              </button>
                              <button
                                onClick={() => acceptSuggestion(current, s, suggestionDraft)}
                                disabled={!suggestionDraft.title.trim() || acting === s.id}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-o2-green text-bg-deep font-semibold rounded-lg hover:bg-o2-green-bright disabled:opacity-50 transition-colors"
                              >
                                {acting === s.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                Salvar e adicionar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-ink font-medium">{s.title}</p>
                              {s.description && <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">{s.description}</p>}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-ink-ghost">{s.sourceLabel}</span>
                                {s.priority && <span className={cn("text-[10px]", priorityColor(s.priority))}>{priorityLabel(s.priority)}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => acceptSuggestion(current, s)}
                                disabled={acting === s.id}
                                className="flex items-center gap-1 text-xs bg-o2-green/15 text-o2-green hover:bg-o2-green/25 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                              >
                                {acting === s.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Aceitar
                              </button>
                              <button
                                onClick={() => startEditSuggestion(current, s)}
                                disabled={acting === s.id}
                                className="text-ink-faint hover:text-o2-green transition-colors p-1.5"
                                title="Editar antes de aceitar (responsável, cliente como responsável, prazo…)"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => rejectSuggestion(current, s)}
                                disabled={acting === s.id}
                                className="text-ink-faint hover:text-red-400 transition-colors p-1.5"
                                title="Descartar"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {current.meetings.length > 0 && (
              <section className="mb-8">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint mb-3">
                  <CalendarDays size={13} /> Reuniões da semana
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {current.meetings.map((m) => {
                    const temp = m.temperature ? TEMPERATURE_META[m.temperature] : null;
                    return (
                      <div key={m.id} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
                        <p className="text-sm text-ink font-medium truncate">{m.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-ink-faint">{format(new Date(m.startAt), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                          {m.meetingType && (
                            <span className="text-[10px] text-ink-mid bg-surface-3 rounded px-1.5 py-0.5">
                              {MEETING_TYPE_LABELS[m.meetingType] ?? m.meetingType}
                            </span>
                          )}
                          {temp && <span className={cn("text-[10px] rounded px-1.5 py-0.5", temp.className)}>{temp.label}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* tarefas em aberto agrupadas por status (mesmas colunas do Kanban) — assim
                "quanto tem de tarefa pendente" tem resposta direta no título de cada grupo */}
            {STATUS_GROUPS.map((group) => {
              const items = current.tasksOpen.filter((t) => t.status === group.id);
              if (items.length === 0) return null;
              return (
                <section key={group.id} className="mb-8">
                  <h2 className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint mb-3 border-l-2 pl-2", group.color)}>
                    {group.label} ({items.length})
                  </h2>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <WeeklyReviewTaskRow
                        key={t.id}
                        task={t}
                        isNew={t.isNew}
                        client={current.name}
                        users={data.users}
                        onUpdated={(u) => onTaskUpdated(current.name, u)}
                        onDeleted={(id) => onTaskDeleted(current.name, id)}
                        onOpen={setSelectedTask}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {current.tasksCompleted.length > 0 && (
              <details className="mb-8">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1">
                  Concluídas essa semana ({current.tasksCompleted.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {current.tasksCompleted.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm text-ink-dim">
                      <CheckCircle2 size={13} className="text-o2-green shrink-0" />
                      <span className="line-through decoration-ink-ghost">{t.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            </div>
          </div>
        )}
      </div>

      {/* navegação */}
      <div className="relative z-10 flex items-center justify-center gap-4 px-6 py-4 border-t border-surface-3/60">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-1.5 text-sm text-ink-mid hover:text-ink disabled:opacity-30 disabled:hover:text-ink-mid transition-colors"
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        <div className="flex items-center gap-1 max-w-[50vw] overflow-x-auto py-1">
          {clients.map((c, i) => (
            <button
              key={c.name}
              onClick={() => goTo(i)}
              className={cn(
                "shrink-0 h-1.5 rounded-full transition-all",
                i === index ? "bg-o2-green w-4" : isClientQuiet(c) ? "bg-surface-3 w-1.5" : "bg-ink-ghost w-1.5"
              )}
              title={c.name}
            />
          ))}
        </div>
        <button
          onClick={next}
          disabled={index === total - 1}
          className="flex items-center gap-1.5 text-sm text-ink-mid hover:text-ink disabled:opacity-30 disabled:hover:text-ink-mid transition-colors"
        >
          Próximo <ChevronRight size={16} />
        </button>
      </div>

      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handlePanelStatusChange}
        onDeleted={handlePanelDeleted}
        onUpdated={handlePanelUpdated}
        users={data.users}
      />
    </div>
  );
}
