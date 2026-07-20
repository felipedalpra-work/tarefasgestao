"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import type { TaskListItem, UserOption } from "@/types/task";

const COLUMNS = [
  { id: "todo", label: "A fazer", color: "border-ink-faint" },
  { id: "in_progress", label: "Em andamento", color: "border-blue-400" },
  { id: "blocked", label: "Bloqueado", color: "border-red-400" },
  { id: "done", label: "Concluído", color: "border-o2-green" },
];

function KanbanPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ col: string; index: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);

  const assigneeParam = searchParams.get("assignee"); // null = não definido, "all" = todos, ou lista separada por vírgula
  const clientParam = searchParams.get("client"); // null/"all" = todos os clientes

  const selectedAssignees = useMemo(
    () => (assigneeParam && assigneeParam !== "all" ? assigneeParam.split(",").filter(Boolean) : []),
    [assigneeParam]
  );
  const selectedClient = clientParam && clientParam !== "all" ? clientParam : null;

  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    router.replace(`/kanban?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  function toggleAssignee(userId: string) {
    const next = selectedAssignees.includes(userId)
      ? selectedAssignees.filter((id) => id !== userId)
      : [...selectedAssignees, userId];
    setParams({ assignee: next.length ? next.join(",") : "all" });
  }

  // drill-down: só mostra clientes que aparecem nas tarefas das pessoas já selecionadas
  const clientOptions = useMemo(() => {
    const relevant = selectedAssignees.length
      ? tasks.filter((t) => t.assignee && selectedAssignees.includes(t.assignee.id))
      : tasks;
    const set = new Set(relevant.map((t) => t.client).filter((c): c is string => !!c));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks, selectedAssignees]);

  async function load() {
    const [tasksRes, usersRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/users"),
    ]);
    setTasks(await tasksRes.json());
    setUsers(await usersRes.json());
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (session?.user?.id && assigneeParam === null) setParams({ assignee: session.user.id });
  }, [session?.user?.id, assigneeParam, setParams]);

  // drill-down: se o cliente selecionado deixou de existir entre as pessoas escolhidas, limpa
  useEffect(() => {
    if (selectedClient && !clientOptions.includes(selectedClient)) setParams({ client: "all" });
  }, [selectedClient, clientOptions, setParams]);

  // Optimistic update: muda local na hora, persiste em background
  function patchTask(id: string, data: Record<string, unknown>) {
    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => load()); // reverte em caso de erro
  }

  function updateStatus(id: string, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    patchTask(id, { status });
  }

  function colTasksOf(colId: string) {
    return tasks
      .filter((t) => t.status === colId)
      .filter((t) => selectedAssignees.length === 0 || (t.assignee && selectedAssignees.includes(t.assignee.id)))
      .filter((t) => !selectedClient || t.client === selectedClient)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // solta o card na posição indicada: recalcula sortOrder pelo ponto médio dos vizinhos
  function onDrop(colId: string, index: number) {
    if (!dragging) return;
    const colTasks = colTasksOf(colId).filter((t) => t.id !== dragging);
    const before = colTasks[index - 1];
    const after = colTasks[index];
    let sortOrder: number;
    if (!before && !after) sortOrder = 1;
    else if (!before) sortOrder = (after.sortOrder ?? 0) - 1;
    else if (!after) sortOrder = (before.sortOrder ?? 0) + 1;
    else sortOrder = ((before.sortOrder ?? 0) + (after.sortOrder ?? 0)) / 2;

    setTasks((prev) => prev.map((t) => (t.id === dragging ? { ...t, status: colId, sortOrder } : t)));
    patchTask(dragging, { status: colId, sortOrder });
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Kanban</h1>
          <p className="text-ink-mid text-sm mt-0.5">Arraste para mudar status ou reordenar</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all"
        >
          <Plus size={16} />
          Nova Tarefa
        </button>
      </div>

      {/* Person filter — multi-seleção: dá pra combinar mais de uma pessoa (ex: Felipe + Tainara) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 bg-surface border border-surface-3 rounded-xl p-1 self-start">
          <button
            onClick={() => setParams({ assignee: "all" })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedAssignees.length === 0 ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            }`}
          >
            Todos
          </button>
          {users.map((u) => {
            const isActive = selectedAssignees.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                title={u.name || u.email}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-o2-green/30 text-o2-green" : "bg-surface-3 text-ink-mid"
                }`}>
                  {(u.name || u.email)[0].toUpperCase()}
                </span>
                {u.name?.split(" ")[0] || u.email}
              </button>
            );
          })}
        </div>

        {/* Client filter — drill-down: só lista clientes das pessoas já selecionadas acima */}
        {clientOptions.length > 0 && (
          <select
            value={selectedClient ?? "all"}
            onChange={(e) => setParams({ client: e.target.value })}
            className="bg-surface border border-surface-3 rounded-xl px-3 py-2 text-xs font-medium text-ink-mid focus:outline-none focus:border-o2-green/50"
          >
            <option value="all">Todos os clientes</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = colTasksOf(col.id);
          return (
            <div
              key={col.id}
              className="flex-shrink-0 w-72 flex flex-col"
              onDragOver={(e) => {
                e.preventDefault();
                if (dropTarget?.col !== col.id || dropTarget.index !== colTasks.length) {
                  setDropTarget({ col: col.id, index: colTasks.length });
                }
              }}
              onDrop={() => dropTarget && onDrop(col.id, dropTarget.col === col.id ? dropTarget.index : colTasks.length)}
            >
              {/* Column header */}
              <div className={cn("flex items-center gap-2 mb-3 pb-3 border-b-2", col.color)}>
                <span className="text-sm font-semibold text-ink">{col.label}</span>
                <span className="ml-auto text-xs font-bold text-ink-mid bg-surface-3 px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {colTasks.map((t, i) => (
                  <div key={t.id}>
                    {/* indicador de posição de drop */}
                    {dragging && dropTarget?.col === col.id && dropTarget.index === i && dragging !== t.id && (
                      <div className="h-0.5 bg-o2-green rounded-full mb-2 animate-fade-in" />
                    )}
                    <div
                      draggable
                      onDragStart={() => setDragging(t.id)}
                      onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                        if (dropTarget?.col !== col.id || dropTarget.index !== index) {
                          setDropTarget({ col: col.id, index });
                        }
                      }}
                      onDrop={(e) => { e.stopPropagation(); if (dropTarget) onDrop(col.id, dropTarget.index); }}
                      className={cn(
                        "cursor-grab active:cursor-grabbing transition-opacity",
                        dragging === t.id && "opacity-40"
                      )}
                    >
                      <TaskCard task={t} onStatusChange={updateStatus} onClick={setSelectedTask} />
                    </div>
                  </div>
                ))}
                {/* indicador no fim da coluna */}
                {dragging && dropTarget?.col === col.id && dropTarget.index === colTasks.length && (
                  <div className="h-0.5 bg-o2-green rounded-full animate-fade-in" />
                )}
                {colTasks.length === 0 && (
                  <div className={cn(
                    "border-2 border-dashed rounded-xl h-20 flex items-center justify-center transition-colors",
                    dragging && dropTarget?.col === col.id ? "border-o2-green/40" : "border-surface-3"
                  )}>
                    <p className="text-xs text-ink-faint">Vazio</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && session?.user?.id && (
        <NewTaskModal
          users={users}
          currentUserId={session.user.id}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}

      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={(id, status) => { updateStatus(id, status); setSelectedTask((t) => t ? { ...t, status } : t); }}
        onDeleted={(id) => { setTasks((prev) => prev.filter((t) => t.id !== id)); setSelectedTask(null); }}
        onUpdated={(updated) => { setTasks((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t)); setSelectedTask(updated); load(); }}
        users={users}
      />
    </div>
  );
}

export default function KanbanPage() {
  return (
    <Suspense fallback={null}>
      <KanbanPageInner />
    </Suspense>
  );
}
