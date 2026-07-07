"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Filter } from "lucide-react";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { useSession } from "next-auth/react";
import type { TaskListItem, UserOption } from "@/types/task";

const PAGE_SIZE = 50;

function TasksPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // filtros vêm da URL (compartilháveis e sobrevivem a refresh)
  const personFilter = searchParams.get("assignee"); // null = ainda não definido, "all" = todos
  const statusFilter = searchParams.get("status") ?? "all";
  const taskParam = searchParams.get("task");

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null) params.delete(k);
      else params.set(k, v);
    });
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
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

  // default: filtra para o usuário logado, a menos que a URL já diga outra coisa
  useEffect(() => {
    if (session?.user?.id && personFilter === null) {
      setParams({ assignee: session.user.id });
    }
  }, [session?.user?.id, personFilter, setParams]);

  // deep-link: ?task=<id> abre o painel de detalhe
  useEffect(() => {
    if (!taskParam) { setSelectedTask(null); return; }
    if (selectedTask?.id === taskParam) return;
    const found = tasks.find((t) => t.id === taskParam);
    if (found) {
      setSelectedTask(found);
    } else if (tasks.length > 0) {
      fetch(`/api/tasks/${taskParam}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((t) => { if (t?.id) setSelectedTask(t); });
    }
  }, [taskParam, tasks]);

  function openTask(task: TaskListItem | null) {
    setSelectedTask(task);
    setParams({ task: task?.id ?? null });
  }

  async function updateStatus(id: string, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const filtered = tasks.filter((t) => {
    const personOk = !personFilter || personFilter === "all" || t.assignee?.id === personFilter;
    const statusOk = statusFilter === "all" || t.status === statusFilter;
    return personOk && statusOk;
  });

  const shown = filtered.slice(0, visible);

  const statuses = [
    { value: "all", label: "Todas" },
    { value: "todo", label: "A fazer" },
    { value: "in_progress", label: "Em andamento" },
    { value: "blocked", label: "Bloqueado" },
    { value: "done", label: "Concluídas" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tarefas</h1>
          <p className="text-ink-mid text-sm mt-0.5">{filtered.length} tarefa{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-o2-green text-bg px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-o2-green-bright transition-all"
        >
          <Plus size={16} />
          Nova Tarefa
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Person filter */}
        <div className="flex items-center gap-1.5 bg-surface border border-surface-3 rounded-xl p-1">
          <button
            onClick={() => setParams({ assignee: "all" })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              !personFilter || personFilter === "all" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            }`}
          >
            Todos
          </button>
          {users.map((u) => {
            const isActive = personFilter === u.id;
            const initials = (u.name || u.email)[0].toUpperCase();
            return (
              <button
                key={u.id}
                onClick={() => setParams({ assignee: isActive ? "all" : u.id })}
                title={u.name || u.email}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-o2-green/30 text-o2-green" : "bg-surface-3 text-ink-mid"
                }`}>
                  {initials}
                </span>
                {u.name?.split(" ")[0] || u.email}
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-surface border border-surface-3 rounded-xl p-1">
          <Filter size={13} className="text-ink-faint ml-2" />
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => setParams({ status: s.value === "all" ? null : s.value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s.value
                  ? "bg-o2-green/10 text-o2-green"
                  : "text-ink-mid hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {shown.map((t) => (
          <TaskCard key={t.id} task={t} onStatusChange={updateStatus} onClick={openTask} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-ink-faint">
            <p className="text-3xl mb-3">✓</p>
            <p className="text-sm">Nenhuma tarefa encontrada</p>
          </div>
        )}
        {filtered.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="w-full py-3 text-xs text-ink-mid hover:text-ink bg-surface border border-surface-3 rounded-xl transition-all"
          >
            Mostrar mais ({filtered.length - visible} restantes)
          </button>
        )}
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
        onClose={() => openTask(null)}
        onStatusChange={(id, status) => { updateStatus(id, status); setSelectedTask((t) => t ? { ...t, status } : t); }}
        onDeleted={(id) => { setTasks((prev) => prev.filter((t) => t.id !== id)); openTask(null); }}
        onUpdated={(updated) => { setTasks((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t)); setSelectedTask(updated); load(); }}
        users={users}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageInner />
    </Suspense>
  );
}
