"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Plus, Pencil, X, ThumbsUp, XCircle, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

type EditForm = {
  title: string;
  description: string;
  assignee: string;
  priority: string;
  dueDate?: string | null;
};

type Suggestion = {
  id: string;
  index: number;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string | null;
  dueDate: string | null;
  status: "pending" | "accepted" | "edited" | "rejected";
  taskId: string | null;
};

type Recap = {
  id: string;
  subject: string;
  createdAt: string;
  processedAt?: string | null;
  client?: string | null;
  suggestions: Suggestion[];
};

type User = { id: string; name?: string | null; email: string };

type Accuracy = { pending: number; accepted: number; edited: number; rejected: number; evaluated: number; accuracyPct: number | null };

const FILTERS = [
  { key: "pendentes", label: "Pendentes de revisão" },
  { key: "todas", label: "Todas" },
] as const;

function RecapsPageInner() {
  const searchParams = useSearchParams();
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pendentes");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: "", description: "", assignee: "", priority: "medium" });

  async function load() {
    const [recapsRes, usersRes, accuracyRes] = await Promise.all([
      fetch("/api/recaps"),
      fetch("/api/users"),
      fetch("/api/recaps/accuracy"),
    ]);
    setRecaps(await recapsRes.json());
    const u = await usersRes.json();
    if (Array.isArray(u)) setUsers(u);
    setAccuracy(await accuracyRes.json());
  }

  useEffect(() => { load(); }, []);

  // deep-link: ?recap=<id> expande o recap
  useEffect(() => {
    const recapParam = searchParams.get("recap");
    if (recapParam) setExpanded(recapParam);
  }, [searchParams]);

  async function sync() {
    setSyncing(true);
    const res = await fetch("/api/recaps/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok && data.error) {
      toast(data.error, "error");
    } else if (data.synced === 0) {
      toast("Nenhuma transcrição nova encontrada.", "info");
    } else {
      toast(`${data.synced} transcrição(ões) sincronizada(s). ${data.suggestionsExtracted} sugestão(ões) de tarefa identificada(s) — revise antes de adicionar.`, "success");
    }
    await load();
    setSyncing(false);
  }

  async function process(id: string) {
    setLoading(true);
    const res = await fetch(`/api/recaps/${id}/process`, { method: "POST" });
    const data = await res.json();
    if (data.error && !data.suggestions?.length) {
      toast(data.error, "error");
    } else if (data.count > 0) {
      toast(`${data.count} sugestão(ões) de tarefa identificada(s) — revise antes de adicionar.`, "success");
    }
    await load();
    setLoading(false);
    setExpanded(id);
  }

  function matchAssigneeId(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    const found = users.find((u) =>
      u.name?.toLowerCase().split(" ").some((part) => lower.includes(part))
    );
    return found?.id ?? null;
  }

  function updateSuggestion(recapId: string, updated: Suggestion) {
    setRecaps((prev) =>
      prev.map((r) => (r.id !== recapId ? r : { ...r, suggestions: r.suggestions.map((s) => (s.id === updated.id ? updated : s)) }))
    );
  }

  async function addTask(recap: Recap, suggestion: Suggestion, form: EditForm, edited: boolean) {
    const key = suggestion.id;
    setActingKey(key);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        priority: form.priority || "medium",
        assigneeId: matchAssigneeId(form.assignee),
        dueDate: form.dueDate || null,
        source: "meet_recap",
        sourceRef: recap.id,
        client: recap.client ?? null,
        recapSuggestionId: suggestion.id,
        suggestionEdited: edited,
      }),
    });
    setActingKey(null);
    if (res.ok) {
      const task = await res.json();
      updateSuggestion(recap.id, { ...suggestion, status: edited ? "edited" : "accepted", taskId: task.id });
      setEditingKey(null);
      toast("Tarefa adicionada ao Kanban", "success");
      fetch("/api/recaps/accuracy").then((r) => r.json()).then(setAccuracy);
    } else {
      toast("Erro ao adicionar a tarefa", "error");
    }
  }

  async function rejectSuggestion(recapId: string, suggestion: Suggestion) {
    const key = suggestion.id;
    setActingKey(key);
    const nextStatus = suggestion.status === "rejected" ? "pending" : "rejected";
    const res = await fetch(`/api/recaps/${recapId}/suggestions/${suggestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setActingKey(null);
    if (res.ok) {
      updateSuggestion(recapId, { ...suggestion, status: nextStatus });
      fetch("/api/recaps/accuracy").then((r) => r.json()).then(setAccuracy);
    } else {
      toast("Erro ao salvar", "error");
    }
  }

  function startEdit(key: string, s: Suggestion) {
    setEditingKey(key);
    setEditForm({ title: s.title, description: s.description ?? "", assignee: s.assignee ?? "", priority: s.priority ?? "medium", dueDate: s.dueDate });
  }

  const shownRecaps = recaps.filter((r) => {
    if (filter === "todas") return true;
    return !r.processedAt || r.suggestions.some((s) => s.status === "pending");
  });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Meet Recaps</h1>
          <p className="text-ink-mid text-sm mt-0.5">Transcrições com label Meet_Recap do Gmail</p>
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-2 bg-surface border border-surface-3 text-ink px-4 py-2.5 rounded-xl font-medium text-sm hover:border-o2-green/50 transition-all disabled:opacity-50"
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Sincronizando..." : "Sincronizar Gmail"}
        </button>
      </div>

      {accuracy && accuracy.evaluated > 0 && (
        <div className="flex items-center gap-4 bg-surface border border-surface-3 rounded-xl px-4 py-3 mb-4 text-xs text-ink-dim">
          <span className="font-semibold text-ink">Taxa de acerto da IA: {accuracy.accuracyPct}%</span>
          <span>{accuracy.accepted + accuracy.edited} aceitas ({accuracy.edited} editadas)</span>
          <span>{accuracy.rejected} rejeitadas</span>
          {accuracy.pending > 0 && <span className="ml-auto text-ink-faint">{accuracy.pending} aguardando revisão</span>}
        </div>
      )}

      <div className="flex gap-1 bg-surface border border-surface-3 rounded-xl p-1 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all",
              filter === f.key ? "bg-o2-green/10 text-o2-green" : "text-ink-dim hover:text-ink hover:bg-surface-2"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shownRecaps.map((recap) => {
          const suggestions = recap.suggestions;
          const isExpanded = expanded === recap.id;
          const pendingCount = suggestions.filter((s) => s.status === "pending").length;

          return (
            <div key={recap.id} id={`recap-${recap.id}`} className="bg-surface border border-surface-3 rounded-xl overflow-hidden">
              <div
                className="flex items-start justify-between p-5 cursor-pointer hover:bg-surface-2 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : recap.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{recap.subject}</p>
                  <p className="text-xs text-ink-faint mt-1">
                    {format(new Date(recap.createdAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    {recap.client && ` · ${recap.client}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {!recap.processedAt && (
                    <button
                      onClick={(e) => { e.stopPropagation(); process(recap.id); }}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs bg-o2-green/10 text-o2-green px-3 py-1.5 rounded-lg hover:bg-o2-green/20 transition-all font-medium disabled:opacity-50"
                    >
                      <Sparkles size={12} />
                      {loading ? "Processando..." : "Extrair tarefas"}
                    </button>
                  )}
                  {recap.processedAt && suggestions.length > 0 && (
                    <span className="text-xs text-o2-green bg-o2-green/10 px-2 py-1 rounded-lg font-medium">
                      {pendingCount > 0 ? `${pendingCount} pendente(s)` : `${suggestions.length} tarefas`}
                    </span>
                  )}
                  {recap.processedAt && (
                    <button
                      onClick={(e) => { e.stopPropagation(); process(recap.id); }}
                      disabled={loading}
                      className="text-xs text-ink-faint hover:text-o2-green transition-colors"
                      title="Reprocessar com a IA de novo"
                    >
                      <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={15} className="text-ink-faint" />
                  ) : (
                    <ChevronDown size={15} className="text-ink-faint" />
                  )}
                </div>
              </div>

              {isExpanded && suggestions.length > 0 && (
                <div className="border-t border-surface-3 p-5">
                  <p className="text-xs font-semibold text-ink-mid uppercase tracking-wide mb-3">
                    Tarefas sugeridas pela IA — revise antes de adicionar
                  </p>
                  <div className="space-y-3">
                    {suggestions.map((s) => {
                      const key = s.id;
                      const isEditing = editingKey === key;
                      const acting = actingKey === key;

                      if (isEditing) {
                        return (
                          <div key={key} className="bg-surface-2 rounded-lg p-3 space-y-2 border border-o2-green/20">
                            <input
                              value={editForm.title}
                              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                            />
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                              rows={2}
                              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-o2-green/50 resize-none"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={matchAssigneeId(editForm.assignee) ?? ""}
                                onChange={(e) => {
                                  const u = users.find((x) => x.id === e.target.value);
                                  setEditForm((f) => ({ ...f, assignee: u?.name ?? "" }));
                                }}
                                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none"
                              >
                                <option value="">Sem responsável</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                              </select>
                              <select
                                value={editForm.priority}
                                onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none"
                              >
                                <option value="high">Alta</option>
                                <option value="medium">Média</option>
                                <option value="low">Baixa</option>
                              </select>
                              <input
                                type="date"
                                value={editForm.dueDate?.slice(0, 10) ?? ""}
                                onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value || null }))}
                                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none"
                              />
                              <div className="ml-auto flex items-center gap-1.5">
                                <button
                                  onClick={() => addTask(recap, s, editForm, true)}
                                  disabled={acting || !editForm.title.trim()}
                                  className="flex items-center gap-1 text-xs bg-o2-green text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-o2-green-bright transition-all disabled:opacity-50"
                                >
                                  <Plus size={12} />
                                  {acting ? "Adicionando…" : "Adicionar"}
                                </button>
                                <button onClick={() => setEditingKey(null)} className="text-ink-faint hover:text-ink p-1">
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={key} className={cn("flex items-start gap-3 rounded-lg p-3", s.status === "rejected" ? "bg-surface-2/50 opacity-60" : "bg-surface-2")}>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium text-ink", s.status === "rejected" && "line-through")}>{s.title}</p>
                            {s.description && (
                              <p className="text-xs text-ink-mid mt-1">{s.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {s.assignee && (
                                <span className="text-xs text-ink-dim">→ {s.assignee}</span>
                              )}
                              <span
                                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                  s.priority === "high"
                                    ? "bg-red-500/20 text-red-400"
                                    : s.priority === "low"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              >
                                {s.priority || "média"}
                              </span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1.5">
                            {s.status === "pending" && (
                              <>
                                <button
                                  onClick={() => startEdit(key, s)}
                                  className="text-ink-faint hover:text-o2-green p-1.5 transition-colors"
                                  title="Editar antes de adicionar"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => rejectSuggestion(recap.id, s)}
                                  disabled={acting}
                                  className="text-ink-faint hover:text-red-400 p-1.5 transition-colors disabled:opacity-50"
                                  title="Descartar sugestão"
                                >
                                  <XCircle size={14} />
                                </button>
                                <button
                                  onClick={() => addTask(recap, s, { title: s.title, description: s.description ?? "", assignee: s.assignee ?? "", priority: s.priority ?? "medium", dueDate: s.dueDate }, false)}
                                  disabled={acting}
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium bg-o2-green/10 text-o2-green hover:bg-o2-green/20 disabled:opacity-70"
                                >
                                  <Plus size={12} />
                                  {acting ? "Adicionando…" : "Adicionar"}
                                </button>
                              </>
                            )}
                            {(s.status === "accepted" || s.status === "edited") && (
                              <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-o2-green/20 text-o2-green">
                                <ThumbsUp size={12} />
                                {s.status === "edited" ? "Editada e adicionada" : "Adicionada"}
                              </span>
                            )}
                            {s.status === "rejected" && (
                              <button
                                onClick={() => rejectSuggestion(recap.id, s)}
                                disabled={acting}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium text-ink-faint hover:text-ink transition-all disabled:opacity-50"
                                title="Desfazer descarte"
                              >
                                <Undo2 size={12} />
                                Descartada
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isExpanded && suggestions.length === 0 && recap.processedAt && (
                <div className="border-t border-surface-3 p-5">
                  <p className="text-sm text-ink-faint">Nenhuma tarefa identificada nesta transcrição.</p>
                </div>
              )}
            </div>
          );
        })}

        {shownRecaps.length === 0 && (
          <div className="text-center py-16 text-ink-faint">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-sm">{filter === "pendentes" ? "Nenhum recap pendente de revisão." : "Nenhuma transcrição encontrada"}</p>
            {recaps.length === 0 && <p className="text-xs mt-1">Sincronize o Gmail para buscar emails com label Meet_Recap</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecapsPage() {
  return (
    <Suspense fallback={null}>
      <RecapsPageInner />
    </Suspense>
  );
}
