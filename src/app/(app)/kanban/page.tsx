"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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

  const personFilter = searchParams.get("assignee"); // null = não definido, "all" = todos

  const setAssigneeParam = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("assignee", value);
    router.replace(`/kanban?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

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
    if (session?.user?.id && personFilter === null) setAssigneeParam(session.user.id);
  }, [session?.user?.id, personFilter, setAssigneeParam]);

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
      .filter((t) => t.status === colId && (!personFilter || personFilter === "all" || t.assignee?.id === personFilter))
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

      {/* Person filter */}
      <div className="flex items-center gap-1.5 bg-surface border border-surface-3 rounded-xl p-1 mb-4 self-start">
        <button
          onClick={() => setAssigneeParam("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !personFilter || personFilter === "all" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
          }`}
        >
          Todos
        </button>
        {users.map((u) => {
          const isActive = personFilter === u.id;
          return (
            <button
              key={u.id}
              onClick={() => setAssigneeParam(isActive ? "all" : u.id)}
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
