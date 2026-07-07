"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Plus, Check, Pencil, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";

type SuggestedTask = {
  title: string;
  description: string;
  assignee: string;
  priority: string;
  dueDate?: string | null;
};

type Recap = {
  id: string;
  subject: string;
  createdAt: string;
  processedAt?: string | null;
  suggestedTasks?: string | null;
  client?: string | null;
};

type User = { id: string; name?: string | null; email: string };

function RecapsPageInner() {
  const searchParams = useSearchParams();
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SuggestedTask>({ title: "", description: "", assignee: "", priority: "medium" });

  async function load() {
    const [recapsRes, usersRes] = await Promise.all([
      fetch("/api/recaps"),
      fetch("/api/users"),
    ]);
    setRecaps(await recapsRes.json());
    const u = await usersRes.json();
    if (Array.isArray(u)) setUsers(u);
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
      toast(`${data.synced} transcrição(ões) sincronizada(s). ${data.tasksCreated} tarefa(s) criada(s) no Kanban.`, "success");
    }
    await load();
    setSyncing(false);
  }

  async function process(id: string) {
    setLoading(true);
    const res = await fetch(`/api/recaps/${id}/process`, { method: "POST" });
    const data = await res.json();
    if (data.error && !data.tasks?.length) {
      toast(data.error, "error");
    } else if (data.created > 0) {
      toast(`${data.created} tarefa(s) criada(s) automaticamente no Kanban.`, "success");
    }
    await load();
    setLoading(false);
    setExpanded(id);
  }

  function matchAssigneeId(name: string): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    const found = users.find((u) =>
      u.name?.toLowerCase().split(" ").some((part) => lower.includes(part))
    );
    return found?.id ?? null;
  }

  async function addTask(recapId: string, task: SuggestedTask, idx: number) {
    const key = `${recapId}-${idx}`;
    setAddingKey(key);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        priority: task.priority || "medium",
        assigneeId: matchAssigneeId(task.assignee),
        dueDate: task.dueDate || null,
        source: "meet_recap",
        sourceRef: recapId,
        client: recaps.find((r) => r.id === recapId)?.client ?? null,
      }),
    });
    setAddingKey(null);
    if (res.ok) {
      setAdded((a) => ({ ...a, [key]: true }));
      setEditingKey(null);
      toast("Tarefa adicionada ao Kanban", "success");
    } else {
      toast("Erro ao adicionar a tarefa", "error");
    }
  }

  function startEdit(key: string, task: SuggestedTask) {
    setEditingKey(key);
    setEditForm({ ...task });
  }

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

      <div className="space-y-3">
        {recaps.map((recap) => {
          const tasks: SuggestedTask[] = recap.suggestedTasks ? JSON.parse(recap.suggestedTasks) : [];
          const isExpanded = expanded === recap.id;

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
                  {recap.processedAt && tasks.length > 0 && (
                    <span className="text-xs text-o2-green bg-o2-green/10 px-2 py-1 rounded-lg font-medium">
                      {tasks.length} tarefas
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={15} className="text-ink-faint" />
                  ) : (
                    <ChevronDown size={15} className="text-ink-faint" />
                  )}
                </div>
              </div>

              {isExpanded && tasks.length > 0 && (
                <div className="border-t border-surface-3 p-5">
                  <p className="text-xs font-semibold text-ink-mid uppercase tracking-wide mb-3">
                    Tarefas sugeridas pela IA — revise antes de adicionar
                  </p>
                  <div className="space-y-3">
                    {tasks.map((task, idx) => {
                      const key = `${recap.id}-${idx}`;
                      const done = added[key] === true;
                      const isEditing = editingKey === key;

                      if (isEditing) {
                        return (
                          <div key={idx} className="bg-surface-2 rounded-lg p-3 space-y-2 border border-o2-green/20">
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
                                  onClick={() => addTask(recap.id, editForm, idx)}
                                  disabled={addingKey === key || !editForm.title.trim()}
                                  className="flex items-center gap-1 text-xs bg-o2-green text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-o2-green-bright transition-all disabled:opacity-50"
                                >
                                  <Plus size={12} />
                                  {addingKey === key ? "Adicionando…" : "Adicionar"}
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
                        <div key={idx} className="flex items-start gap-3 bg-surface-2 rounded-lg p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-ink-mid mt-1">{task.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {task.assignee && (
                                <span className="text-xs text-ink-dim">→ {task.assignee}</span>
                              )}
                              <span
                                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                  task.priority === "high"
                                    ? "bg-red-500/20 text-red-400"
                                    : task.priority === "low"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              >
                                {task.priority || "média"}
                              </span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1.5">
                            {!done && (
                              <button
                                onClick={() => startEdit(key, task)}
                                className="text-ink-faint hover:text-o2-green p-1.5 transition-colors"
                                title="Editar antes de adicionar"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => addTask(recap.id, task, idx)}
                              disabled={addingKey === key || done}
                              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium disabled:opacity-70 ${
                                done ? "bg-o2-green/20 text-o2-green" : "bg-o2-green/10 text-o2-green hover:bg-o2-green/20"
                              }`}
                            >
                              {done ? <Check size={12} /> : <Plus size={12} />}
                              {done ? "Adicionada" : addingKey === key ? "Adicionando…" : "Adicionar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isExpanded && tasks.length === 0 && recap.processedAt && (
                <div className="border-t border-surface-3 p-5">
                  <p className="text-sm text-ink-faint">Nenhuma tarefa identificada nesta transcrição.</p>
                </div>
              )}
            </div>
          );
        })}

        {recaps.length === 0 && (
          <div className="text-center py-16 text-ink-faint">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-sm">Nenhuma transcrição encontrada</p>
            <p className="text-xs mt-1">Sincronize o Gmail para buscar emails com label Meet_Recap</p>
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
