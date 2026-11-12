"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, FileText, CheckSquare, Clock, CheckCircle2, Circle, StickyNote, Check, Database, Rocket, ShieldAlert, ClipboardCheck } from "lucide-react";
import { cn, dueDateOnly } from "@/lib/utils";
import { toast } from "@/components/Toaster";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { OnboardingTab } from "./OnboardingTab";
import { FechamentoTab } from "./FechamentoTab";
import { TratativaCard, type TratativaData } from "@/components/TratativaCard";
import { NewTratativaForm } from "@/components/NewTratativaForm";
import { ClientAccessesSection } from "@/components/ClientAccessesSection";
import { MeetingReviewCard } from "@/components/MeetingReviewCard";

type CalendarEvent = {
  id: string;
  title: string;
  startAt: string | Date;
  endAt: string | Date;
  briefingSent: boolean;
  meetingType: string | null;
  temperature: string | null;
  nextSteps: string | null;
  suggestedTemperature: string | null;
  suggestedNextSteps: string | null;
  attendanceConfirmed: boolean;
  registroConferido: boolean;
  pipefyResumo: string | null; // "Resumo" da reunião no Pipefy, ao vivo (campo distinto de Observações/Próximos passos) — null quando não casou com nenhum registro (ver page.tsx)
  resumoEditado: string | null; // cópia editável na plataforma — se preenchida, tem prioridade sobre pipefyResumo na exibição; nunca escrita de volta no Pipefy
};

type Recap = {
  id: string;
  subject: string;
  createdAt: string | Date;
  processedAt: string | Date | null;
  suggestedTasks: string | null;
  client: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  client: string | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
};

type UserOption = { id: string; name: string | null };

type Props = {
  events: CalendarEvent[];
  recaps: Recap[];
  tasks: Task[];
  tratativas: TratativaData[];
  users: UserOption[];
  currentUserId: string;
  client: string;
};

const STATUS_LABEL: Record<string, string> = { todo: "A fazer", in_progress: "Em progresso", done: "Concluída" };
const PRIORITY_COLOR: Record<string, string> = { high: "text-red-400", medium: "text-yellow-400", low: "text-o2-green" };
const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };

type OxyFields = {
  updateFrequency: string;
  updateResponsible: string;
  routineWhat: string;
  routineWho: string;
  routineWhen: string;
  oxyPendencies: string;
  pendencyWho: string;
};

const EMPTY_OXY: OxyFields = {
  updateFrequency: "",
  updateResponsible: "",
  routineWhat: "",
  routineWho: "",
  routineWhen: "",
  oxyPendencies: "",
  pendencyWho: "",
};

export function ClientTabs({ events: initialEvents, recaps, tasks, tratativas: initialTratativas, users, currentUserId, client }: Props) {
  const [tab, setTab] = useState<"meetings" | "recaps" | "tasks" | "onboarding" | "tratativas" | "fechamento" | "oxy" | "notes">("meetings");
  const [taskFilter, setTaskFilter] = useState<"mine" | "all">("mine");
  const [tratativas, setTratativas] = useState(initialTratativas);
  const [events, setEvents] = useState(initialEvents);
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [oxy, setOxy] = useState<OxyFields>(EMPTY_OXY);
  const [oxyLoaded, setOxyLoaded] = useState(false);
  const [savingOxy, setSavingOxy] = useState(false);

  const myTasks = tasks.filter((t) => t.assignee?.id === currentUserId);
  const shownTasks = taskFilter === "mine" ? myTasks : tasks;

  useEffect(() => {
    if (tab === "notes" && !notesLoaded) {
      fetch(`/api/clients/${encodeURIComponent(client)}`)
        .then((r) => r.json())
        .then((data) => {
          setNotes(data.notes ?? "");
          setContacts(data.contacts ?? "");
          setNotesLoaded(true);
        })
        .catch(() => setNotesLoaded(true));
    }
    if (tab === "oxy" && !oxyLoaded) {
      fetch(`/api/clients/${encodeURIComponent(client)}`)
        .then((r) => r.json())
        .then((data) => {
          setOxy({
            updateFrequency: data.updateFrequency ?? "",
            updateResponsible: data.updateResponsible ?? "",
            routineWhat: data.routineWhat ?? "",
            routineWho: data.routineWho ?? "",
            routineWhen: data.routineWhen ?? "",
            oxyPendencies: data.oxyPendencies ?? "",
            pendencyWho: data.pendencyWho ?? "",
          });
          setOxyLoaded(true);
        })
        .catch(() => setOxyLoaded(true));
    }
  }, [tab, notesLoaded, oxyLoaded, client]);

  async function saveNotes() {
    setSavingNotes(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || null, contacts: contacts || null }),
    });
    setSavingNotes(false);
    if (res.ok) toast("Notas salvas", "success");
    else toast("Erro ao salvar as notas", "error");
  }

  async function saveOxy() {
    setSavingOxy(true);
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updateFrequency: oxy.updateFrequency || null,
        updateResponsible: oxy.updateResponsible || null,
        routineWhat: oxy.routineWhat || null,
        routineWho: oxy.routineWho || null,
        routineWhen: oxy.routineWhen || null,
        oxyPendencies: oxy.oxyPendencies || null,
        pendencyWho: oxy.pendencyWho || null,
      }),
    });
    setSavingOxy(false);
    if (res.ok) toast("Dados da Oxy salvos", "success");
    else toast("Erro ao salvar", "error");
  }

  async function updateEvent(eventId: string, field: keyof CalendarEvent, value: string | boolean) {
    const prevEvents = events;
    const normalized = typeof value === "string" ? value || null : value;
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, [field]: normalized } : e)));
    const res = await fetch(`/api/calendar/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: normalized }),
    });
    if (!res.ok) {
      setEvents(prevEvents);
      toast("Erro ao salvar", "error");
    }
  }

  // "Aprovar" na sugestão da IA — grava os dois campos de uma vez (o PATCH já limpa a
  // sugestão e já manda pro Pipefy, mesmo caminho de uma edição manual)
  async function approveSuggestion(e: CalendarEvent) {
    const prevEvents = events;
    const { suggestedTemperature, suggestedNextSteps } = e;
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === e.id
          ? { ...ev, temperature: suggestedTemperature, nextSteps: suggestedNextSteps, suggestedTemperature: null, suggestedNextSteps: null }
          : ev
      )
    );
    const res = await fetch(`/api/calendar/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temperature: suggestedTemperature, nextSteps: suggestedNextSteps }),
    });
    if (!res.ok) {
      setEvents(prevEvents);
      toast("Erro ao aprovar sugestão", "error");
    } else {
      toast("Temperatura aprovada — enviada pro Pipefy", "success");
    }
  }

  // "Editar" — só descarta a sugestão (sem tocar na Temperatura/Próximos passos oficiais
  // nem acionar o Pipefy), a pessoa edita o campo normal como já faz hoje
  async function dismissSuggestion(eventId: string) {
    const prevEvents = events;
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, suggestedTemperature: null, suggestedNextSteps: null } : e)));
    const res = await fetch(`/api/calendar/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissSuggestion: true }),
    });
    if (!res.ok) setEvents(prevEvents);
  }

  const tabs = [
    { key: "meetings", label: "Reuniões", icon: CalendarDays, count: events.length },
    { key: "recaps", label: "Meet Recaps", icon: FileText, count: recaps.length },
    { key: "tasks", label: "Tarefas", icon: CheckSquare, count: tasks.length },
    { key: "onboarding", label: "Onboarding", icon: Rocket, count: null },
    { key: "tratativas", label: "Tratativas", icon: ShieldAlert, count: tratativas.length },
    { key: "fechamento", label: "Fechamento", icon: ClipboardCheck, count: null },
    { key: "oxy", label: "Oxy", icon: Database, count: null },
    { key: "notes", label: "Notas", icon: StickyNote, count: null },
  ] as const;

  return (
    <div>
      {/* Tab bar — 8 abas não cabem lado a lado forçando largura igual (flex-1 sem
          min-width:0 não encolhe abaixo do conteúdo, e a página não tem scroll
          horizontal — sobra cortava). Cada aba fica do tamanho do próprio conteúdo,
          e a barra rola horizontalmente se ainda assim não couber tudo. */}
      <div className="flex gap-1 bg-surface border border-surface-3 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              tab === key
                ? "bg-o2-green/10 text-o2-green"
                : "text-ink-dim hover:text-ink hover:bg-surface-2"
            )}
          >
            <Icon size={15} />
            {label}
            {count !== null && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full", tab === key ? "bg-o2-green/20 text-o2-green" : "bg-surface-3 text-ink-faint")}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reuniões */}
      {tab === "meetings" && (
        <div className="space-y-3">
          {events.length === 0 ? (
            <Empty icon={CalendarDays} text="Nenhuma reunião registrada para este cliente." />
          ) : events.map((e) => (
            <MeetingReviewCard
              key={e.id}
              event={e}
              onFieldChange={(field, value) => updateEvent(e.id, field, value)}
              onApproveSuggestion={() => approveSuggestion(e)}
              onDismissSuggestion={() => dismissSuggestion(e.id)}
            />
          ))}
        </div>
      )}

      {/* Recaps */}
      {tab === "recaps" && (
        <div className="space-y-3">
          {recaps.length === 0 ? (
            <Empty icon={FileText} text="Nenhum Meet Recap encontrado para este cliente." />
          ) : recaps.map((r) => {
            let taskCount = 0;
            try { taskCount = r.suggestedTasks ? JSON.parse(r.suggestedTasks).length : 0; } catch {}
            return (
              <Link key={r.id} href={`/recaps?recap=${r.id}`} className="block bg-surface border border-surface-3 rounded-xl p-4 hover:border-o2-green/30 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink leading-snug">{r.subject}</p>
                    <p className="text-xs text-ink-dim mt-1">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.processedAt ? (
                      <span className="flex items-center gap-1 text-xs text-o2-green bg-o2-green/10 px-2 py-1 rounded-full">
                        <CheckCircle2 size={11} /> Processado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-ink-mid bg-surface-3 px-2 py-1 rounded-full">
                        <Clock size={11} /> Pendente
                      </span>
                    )}
                  </div>
                </div>
                {taskCount > 0 && (
                  <p className="text-xs text-o2-green/70 mt-2 flex items-center gap-1">
                    <CheckSquare size={11} />
                    {taskCount} tarefa{taskCount > 1 ? "s" : ""} extraída{taskCount > 1 ? "s" : ""}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Tarefas */}
      {tab === "tasks" && (
        <div>
          <div className="flex gap-2 mb-4">
            {(["mine", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTaskFilter(f)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
                  taskFilter === f ? "bg-o2-green/10 text-o2-green" : "bg-surface border border-surface-3 text-ink-dim hover:text-ink"
                )}
              >
                {f === "mine" ? `Minhas (${myTasks.length})` : `Todas (${tasks.length})`}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {shownTasks.length === 0 ? (
              <Empty icon={CheckSquare} text={taskFilter === "mine" ? "Você não tem tarefas para este cliente." : "Nenhuma tarefa para este cliente."} />
            ) : shownTasks.map((t) => (
              <Link key={t.id} href={`/tasks?task=${t.id}`} className="bg-surface border border-surface-3 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-o2-green/30 transition-all">
                <StatusIcon status={t.status} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", t.status === "done" ? "line-through text-ink-faint" : "text-ink")}>
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("text-xs", PRIORITY_COLOR[t.priority])}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    {t.dueDate && (
                      <span className="text-xs text-ink-faint">
                        · {dueDateOnly(t.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                {t.assignee && (
                  <div className="w-7 h-7 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green text-xs font-bold shrink-0" title={t.assignee.name || ""}>
                    {(t.assignee.name || "?")[0].toUpperCase()}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Onboarding */}
      {tab === "onboarding" && <OnboardingTab client={client} />}

      {/* Tratativas */}
      {tab === "tratativas" && (
        <div className="space-y-3">
          <NewTratativaForm client={client} onCreated={(t) => setTratativas((prev) => [t, ...prev])} />
          {tratativas.length === 0 ? (
            <Empty icon={ShieldAlert} text="Nenhuma tratativa aberta para este cliente." />
          ) : (
            tratativas.map((t) => (
              <TratativaCard
                key={t.id}
                tratativa={t}
                users={users}
                onChange={(updated) => setTratativas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
              />
            ))
          )}
        </div>
      )}

      {/* Fechamento mensal */}
      {tab === "fechamento" && <FechamentoTab client={client} />}

      {/* Oxy */}
      {tab === "oxy" && (
        <div className="space-y-4">
          {!oxyLoaded ? (
            <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>
          ) : (
            <>
              <ClientAccessesSection client={client} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Frequência de atualização</label>
                  <input
                    type="text"
                    value={oxy.updateFrequency}
                    onChange={(e) => setOxy((o) => ({ ...o, updateFrequency: e.target.value }))}
                    placeholder="Ex: toda quarta-feira"
                    className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Responsável pela atualização</label>
                  <input
                    type="text"
                    value={oxy.updateResponsible}
                    onChange={(e) => setOxy((o) => ({ ...o, updateResponsible: e.target.value }))}
                    placeholder="Nome de quem mantém os dados atualizados"
                    className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                </div>
              </div>

              <div className="border-t border-surface-3 pt-4">
                <p className="text-xs font-medium text-ink-mid uppercase tracking-wide mb-3">Rotina com o cliente</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-ink-faint block mb-1.5">O que</label>
                    <input
                      type="text"
                      value={oxy.routineWhat}
                      onChange={(e) => setOxy((o) => ({ ...o, routineWhat: e.target.value }))}
                      placeholder="Ex: Fluxo de Caixa + DRE"
                      className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-faint block mb-1.5">Quem</label>
                    <input
                      type="text"
                      value={oxy.routineWho}
                      onChange={(e) => setOxy((o) => ({ ...o, routineWho: e.target.value }))}
                      placeholder="Responsável"
                      className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-faint block mb-1.5">Quando</label>
                    <input
                      type="text"
                      value={oxy.routineWhen}
                      onChange={(e) => setOxy((o) => ({ ...o, routineWhen: e.target.value }))}
                      placeholder="Ex: toda 6ª antes do almoço"
                      className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-surface-3 pt-4">
                <p className="text-xs font-medium text-ink-mid uppercase tracking-wide mb-3">Pendência com o cliente</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-ink-faint block mb-1.5">O que</label>
                    <input
                      type="text"
                      value={oxy.oxyPendencies}
                      onChange={(e) => setOxy((o) => ({ ...o, oxyPendencies: e.target.value }))}
                      placeholder="Ex: acesso ao ERP pendente"
                      className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-faint block mb-1.5">Quem</label>
                    <input
                      type="text"
                      value={oxy.pendencyWho}
                      onChange={(e) => setOxy((o) => ({ ...o, pendencyWho: e.target.value }))}
                      placeholder="Responsável"
                      className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={saveOxy}
                disabled={savingOxy}
                className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all disabled:opacity-50"
              >
                <Check size={14} />
                {savingOxy ? "Salvando…" : "Salvar"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Notas */}
      {tab === "notes" && (
        <div className="space-y-4">
          {!notesLoaded ? (
            <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Contatos</label>
                <AutoGrowTextarea
                  value={contacts}
                  onChange={(e) => setContacts(e.target.value)}
                  rows={3}
                  placeholder={"Nome — email — telefone\nUm contato por linha"}
                  className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Notas do cliente</label>
                <AutoGrowTextarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={8}
                  maxHeight={480}
                  placeholder="Contexto, preferências, acordos, histórico…"
                  className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                />
              </div>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all disabled:opacity-50"
              >
                <Check size={14} />
                {savingNotes ? "Salvando…" : "Salvar notas"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <CheckCircle2 size={16} className="text-o2-green shrink-0" />;
  if (status === "in_progress") return <Clock size={16} className="text-yellow-400 shrink-0" />;
  return <Circle size={16} className="text-ink-ghost shrink-0" />;
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <Icon size={32} className="text-border mb-3" />
      <p className="text-sm text-ink-faint">{text}</p>
    </div>
  );
}
