"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X, ChevronLeft, ChevronRight, ListFilter, Sparkles, CalendarDays, CheckCircle2,
  PartyPopper, Check, Trash2, Loader2,
} from "lucide-react";
import { cn, priorityLabel, priorityColor } from "@/lib/utils";
import { WeeklyReviewTaskRow } from "@/components/WeeklyReviewTaskRow";
import { LogoIcon } from "@/components/LogoIcon";
import { toast } from "@/components/Toaster";
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

function isClientQuiet(c: ReviewClient): boolean {
  return c.meetings.length === 0 && c.suggestions.length === 0 && c.tasksCompleted.length === 0 && c.tasksOpen.length === 0;
}

export default function WeeklyReviewPage() {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/weekly-review")
      .then((r) => r.json())
      .then((json: ReviewData) => setData(json))
      .catch(() => toast("Erro ao carregar a revisão semanal", "error"))
      .finally(() => setLoading(false));
  }, []);

  const clients = data?.clients ?? [];
  const total = clients.length;
  const current = clients[index] ?? null;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, total - 1)), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { router.push("/tasks"); return; }
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, router]);

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

  async function acceptSuggestion(client: ReviewClient, s: ReviewSuggestion) {
    setActing(s.id);
    const commonFields = {
      title: s.title,
      description: s.description || null,
      priority: s.priority || "medium",
      assignees: [],
      dueDate: s.dueDate || null,
      client: client.name,
      suggestionEdited: false,
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

        <div className="relative ml-4">
          <button
            onClick={() => setJumpOpen((v) => !v)}
            className="flex items-center gap-2 text-xs text-ink-mid hover:text-ink bg-surface border border-surface-3 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ListFilter size={12} />
            {progressLabel}
          </button>
          {jumpOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-surface border border-surface-3 rounded-xl shadow-2xl p-2 animate-slide-in-up z-20">
              {clients.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => { setIndex(i); setJumpOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                    i === index ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {isClientQuiet(c) ? (
                    <Check size={12} className="shrink-0 text-ink-ghost" />
                  ) : (
                    <span className="shrink-0 text-[10px] bg-o2-green/15 text-o2-green px-1.5 py-0.5 rounded-full">
                      {c.tasksOpen.length + c.suggestions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => router.push("/tasks")}
          className="ml-auto flex items-center gap-1.5 text-xs text-ink-mid hover:text-ink transition-colors"
        >
          <X size={14} /> Sair (Esc)
        </button>
      </div>

      {/* slide do cliente atual */}
      {current && (
        <div key={current.name} className="relative z-10 flex-1 overflow-y-auto animate-fade-in">
          <div className="max-w-4xl mx-auto px-6 py-10">
            <div className="mb-8">
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

            {quiet && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <PartyPopper size={32} className="text-o2-green" />
                <p className="text-ink-mid">Nada pra revisar essa semana — pode passar pro próximo.</p>
              </div>
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

            {current.suggestions.length > 0 && (
              <section className="mb-8">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint mb-3">
                  <Sparkles size={13} /> Sugestões pendentes ({current.suggestions.length})
                </h2>
                <div className="space-y-2">
                  {current.suggestions.map((s) => (
                    <div key={s.id} className="bg-surface-2 border border-o2-green/20 rounded-lg px-3 py-2.5">
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
                            onClick={() => rejectSuggestion(current, s)}
                            disabled={acting === s.id}
                            className="text-ink-faint hover:text-red-400 transition-colors p-1.5"
                            title="Descartar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {current.tasksOpen.length > 0 && (
              <section className="mb-8">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint mb-3">
                  <CheckCircle2 size={13} /> Tarefas em aberto ({current.tasksOpen.length})
                </h2>
                <div className="space-y-2">
                  {current.tasksOpen.map((t) => (
                    <WeeklyReviewTaskRow
                      key={t.id}
                      task={t}
                      isNew={t.isNew}
                      client={current.name}
                      users={data.users}
                      onUpdated={(u) => onTaskUpdated(current.name, u)}
                      onDeleted={(id) => onTaskDeleted(current.name, id)}
                    />
                  ))}
                </div>
              </section>
            )}

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
              onClick={() => setIndex(i)}
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
    </div>
  );
}
