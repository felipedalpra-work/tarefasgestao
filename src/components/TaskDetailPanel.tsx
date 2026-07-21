"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  X, Send, MessageSquare, Calendar, User, Tag, Building2, Clock, CheckCircle2,
  Circle, AlertCircle, Trash2, Pencil, Check, ListChecks, Link2, Plus, History, Repeat, Video,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, priorityColor, priorityLabel, statusLabel } from "@/lib/utils";
import { toast } from "./Toaster";
import type { TaskListItem, UserOption } from "@/types/task";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};

type Subtask = { id: string; title: string; done: boolean };
type TaskLink = { id: string; url: string; label: string | null };
type Activity = { id: string; type: string; detail: string | null; userName: string | null; createdAt: string };

type Props = {
  task: TaskListItem | null;
  onClose: () => void;
  onStatusChange?: (id: string, status: string) => void;
  onDeleted?: (id: string) => void;
  onUpdated?: (task: TaskListItem) => void;
  users?: UserOption[];
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  done: CheckCircle2,
  in_progress: Clock,
  blocked: AlertCircle,
  todo: Circle,
};
const STATUS_COLORS: Record<string, string> = {
  done: "text-o2-green",
  in_progress: "text-blue-400",
  blocked: "text-red-400",
  todo: "text-ink-faint",
};
const ALL_STATUSES = ["todo", "in_progress", "blocked", "done"];

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

export function TaskDetailPanel({ task, onClose, onStatusChange, onDeleted, onUpdated, users = [] }: Props) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [text, setText] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newLink, setNewLink] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "", dueDate: "", assigneeId: "", client: "", recurrence: "" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!task) return;
    setComments([]);
    setSubtasks([]);
    setLinks([]);
    setActivity(null);
    setTab("comments");
    setText("");
    setConfirmDelete(false);
    setDeleting(false);
    setEditing(false);
    setStatusMenu(false);
    setShowLinkInput(false);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
      assigneeId: task.assignee?.id ?? "",
      client: task.client ?? "",
      recurrence: task.recurrence ?? "",
    });
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setComments(data); });
    fetch(`/api/tasks/${task.id}/subtasks`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSubtasks(data); });
    fetch(`/api/tasks/${task.id}/links`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLinks(data); });
  }, [task?.id]);

  useEffect(() => {
    if (tab === "activity" && task && activity === null) {
      fetch(`/api/tasks/${task.id}/activity`)
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setActivity(data); });
    }
  }, [tab, task?.id, activity]);

  useEffect(() => {
    if (comments.length > 0 && tab === "comments") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length, tab]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function saveEdit() {
    if (!task || saving) return;
    setSaving(true);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title,
        description: editForm.description || null,
        priority: editForm.priority,
        dueDate: editForm.dueDate || null,
        assigneeId: editForm.assigneeId || null,
        client: editForm.client.trim() || null,
        recurrence: editForm.recurrence || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdated?.({ ...task, ...updated });
      setEditing(false);
      setActivity(null); // força re-fetch do histórico
      toast("Tarefa atualizada", "success");
    } else {
      toast("Erro ao salvar a tarefa", "error");
    }
    setSaving(false);
  }

  async function deleteTask() {
    if (!task || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Tarefa deletada", "success");
        setDeleting(false);
        setConfirmDelete(false);
        onDeleted?.(task.id);
        onClose();
      } else {
        toast("Erro ao deletar a tarefa", "error");
        setDeleting(false);
        setConfirmDelete(false);
      }
    } catch {
      toast("Erro ao deletar a tarefa", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !task || sending) return;
    setSending(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.trim() }),
    });
    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setText("");
      inputRef.current?.focus();
    }
    setSending(false);
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtask.trim() || !task) return;
    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtask.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setSubtasks((prev) => [...prev, created]);
      setNewSubtask("");
    }
  }

  async function toggleSubtask(sub: Subtask) {
    if (!task) return;
    setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)));
    await fetch(`/api/tasks/${task.id}/subtasks/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !sub.done }),
    });
  }

  async function removeSubtask(sub: Subtask) {
    if (!task) return;
    setSubtasks((prev) => prev.filter((s) => s.id !== sub.id));
    await fetch(`/api/tasks/${task.id}/subtasks/${sub.id}`, { method: "DELETE" });
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newLink.trim() || !task) return;
    const res = await fetch(`/api/tasks/${task.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newLink.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setLinks((prev) => [...prev, created]);
      setNewLink("");
      setShowLinkInput(false);
    }
  }

  async function removeLink(link: TaskLink) {
    if (!task) return;
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    await fetch(`/api/tasks/${task.id}/links?linkId=${link.id}`, { method: "DELETE" });
  }

  if (!task) return null;

  const StatusIcon = STATUS_ICONS[task.status] ?? Circle;
  const isOverdue = task.dueDate && task.status !== "done" && new Date(task.dueDate) < new Date();
  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-panel border-l border-surface-3 z-50 flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="relative shrink-0">
              <button onClick={() => setStatusMenu((v) => !v)} className="mt-0.5" title="Mudar status">
                <StatusIcon size={18} className={cn("transition-colors", STATUS_COLORS[task.status])} />
              </button>
              {statusMenu && (
                <div className="absolute left-0 top-7 z-10 bg-surface-2 border border-border rounded-xl shadow-2xl py-1 w-44 animate-slide-in-up">
                  {ALL_STATUSES.map((s) => {
                    const Icon = STATUS_ICONS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          setStatusMenu(false);
                          if (s !== task.status) onStatusChange?.(task.id, s);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-3",
                          s === task.status ? "text-ink font-semibold" : "text-ink-mid"
                        )}
                      >
                        <Icon size={14} className={STATUS_COLORS[s]} />
                        {statusLabel(s)}
                        {s === task.status && <Check size={12} className="ml-auto text-o2-green" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <h2 className={cn("text-sm font-semibold leading-snug", task.status === "done" ? "line-through text-ink-faint" : "text-ink")}>
              {task.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button onClick={saveEdit} disabled={saving || !editForm.title.trim()} className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-o2-green text-bg font-semibold rounded-lg hover:bg-o2-green-bright disabled:opacity-50 transition-colors">
                  <Check size={13} />{saving ? "…" : "Salvar"}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs px-2.5 py-1.5 text-ink-dim hover:text-ink transition-colors">
                  Cancelar
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="text-ink-faint hover:text-o2-green transition-colors p-1" title="Editar tarefa">
                <Pencil size={15} />
              </button>
            )}
            <button onClick={() => setConfirmDelete(true)} className="text-ink-faint hover:text-red-400 transition-colors p-1" title="Deletar tarefa">
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} className="text-ink-dim hover:text-ink transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Delete confirmation bar */}
        {confirmDelete && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-red-500/10 border-b border-red-500/20">
            <span className="text-sm text-red-400">Deletar esta tarefa permanentemente?</span>
            <div className="flex items-center gap-2">
              <button
                onClick={deleteTask}
                disabled={deleting}
                className="text-xs px-3 py-1.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deletando…" : "Sim, deletar"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1.5 bg-surface-3 text-ink-mid rounded-lg hover:text-ink transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Edit form / Meta */}
        {editing ? (
          <div className="px-5 py-4 border-b border-surface-3 space-y-3 overflow-y-auto">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Título</label>
              <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50" />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Descrição</label>
              <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-dim block mb-1">Prioridade</label>
                <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50">
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ink-dim block mb-1">Prazo</label>
                <input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-dim block mb-1">Cliente</label>
                <input value={editForm.client} onChange={e => setEditForm(f => ({ ...f, client: e.target.value }))} placeholder="Nome do cliente"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50" />
              </div>
              <div>
                <label className="text-xs text-ink-dim block mb-1">Recorrência</label>
                <select value={editForm.recurrence} onChange={e => setEditForm(f => ({ ...f, recurrence: e.target.value }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50">
                  <option value="">Nenhuma</option>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>
            </div>
            {users.length > 0 && (
              <div>
                <label className="text-xs text-ink-dim block mb-1">Responsável</label>
                <select value={editForm.assigneeId} onChange={e => setEditForm(f => ({ ...f, assigneeId: e.target.value }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50">
                  <option value="">Sem responsável</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-surface-3 space-y-2.5">
              <MetaRow icon={Tag} label="Prioridade">
                <span className={cn("text-xs font-medium", priorityColor(task.priority))}>{priorityLabel(task.priority)}</span>
              </MetaRow>
              <MetaRow icon={Clock} label="Status">
                <span className="text-xs text-ink-soft">{statusLabel(task.status)}</span>
              </MetaRow>
              {task.dueDate && (
                <MetaRow icon={Calendar} label="Prazo">
                  <span className={cn("text-xs", isOverdue ? "text-red-400" : "text-ink-soft")}>
                    {format(new Date(task.dueDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    {isOverdue && " · Atrasada"}
                  </span>
                </MetaRow>
              )}
              {task.recurrence && (
                <MetaRow icon={Repeat} label="Repete">
                  <span className="text-xs text-ink-soft">{RECURRENCE_LABELS[task.recurrence] ?? task.recurrence}</span>
                </MetaRow>
              )}
              {task.assignee ? (
                <MetaRow icon={User} label="Responsável">
                  <span className="text-xs text-ink-soft">{task.assignee.name}</span>
                </MetaRow>
              ) : task.deliverTo === "o2" ? (
                <MetaRow icon={User} label="Responsável">
                  <span className="text-xs text-ink-soft">Cliente</span>
                </MetaRow>
              ) : null}
              {task.client && (
                <MetaRow icon={Building2} label="Cliente">
                  <span className="text-xs text-ink-soft">{task.client}</span>
                </MetaRow>
              )}
              {task.meetingTitle && (
                <MetaRow icon={Video} label="Reunião de origem">
                  <span className="text-xs text-ink-soft">
                    {task.meetingTitle}
                    {task.meetingDate && ` · ${format(new Date(task.meetingDate), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}`}
                  </span>
                </MetaRow>
              )}
            </div>
            {task.description && (
              <div className="px-5 py-4 border-b border-surface-3">
                <p className="text-xs text-ink-mid leading-relaxed whitespace-pre-wrap">{task.description}</p>
              </div>
            )}
          </>
        )}

        {/* Subtasks */}
        <div className="px-5 py-4 border-b border-surface-3">
          <div className="flex items-center gap-2 mb-2.5">
            <ListChecks size={14} className="text-ink-faint" />
            <span className="text-xs font-medium text-ink-dim uppercase tracking-wide">
              Checklist {subtasks.length > 0 && `(${doneCount}/${subtasks.length})`}
            </span>
          </div>
          {subtasks.length > 0 && (
            <div className="mb-1 h-1 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-o2-green rounded-full transition-all" style={{ width: `${Math.round((doneCount / subtasks.length) * 100)}%` }} />
            </div>
          )}
          <div className="space-y-1 mt-2">
            {subtasks.map((s) => (
              <div key={s.id} className="group flex items-center gap-2.5">
                <button onClick={() => toggleSubtask(s)} className="shrink-0">
                  {s.done
                    ? <CheckCircle2 size={15} className="text-o2-green" />
                    : <Circle size={15} className="text-ink-faint hover:text-ink-mid transition-colors" />}
                </button>
                <span className={cn("text-xs flex-1", s.done ? "line-through text-ink-faint" : "text-ink-soft")}>{s.title}</span>
                <button onClick={() => removeSubtask(s)} className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-red-400 transition-all">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addSubtask} className="flex items-center gap-2 mt-2">
            <Plus size={13} className="text-ink-faint shrink-0" />
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Adicionar item…"
              className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-ghost focus:outline-none py-1"
            />
          </form>
        </div>

        {/* Links */}
        <div className="px-5 py-3 border-b border-surface-3">
          <div className="flex items-center gap-2">
            <Link2 size={13} className="text-ink-faint" />
            <span className="text-xs font-medium text-ink-dim uppercase tracking-wide">Links</span>
            <button onClick={() => setShowLinkInput((v) => !v)} className="ml-auto text-ink-faint hover:text-o2-green transition-colors">
              <Plus size={13} />
            </button>
          </div>
          {links.length > 0 && (
            <div className="mt-2 space-y-1">
              {links.map((l) => (
                <div key={l.id} className="group flex items-center gap-2">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline truncate flex-1">
                    {l.label || l.url.replace(/^https?:\/\//, "")}
                  </a>
                  <button onClick={() => removeLink(l)} className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-red-400 transition-all">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {showLinkInput && (
            <form onSubmit={addLink} className="flex items-center gap-2 mt-2">
              <input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                placeholder="Cole a URL (Figma, Drive, doc…)"
                autoFocus
                className="flex-1 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
              />
              <button type="submit" className="text-xs text-o2-green font-medium">OK</button>
            </form>
          )}
        </div>

        {/* Tabs: Comentários | Atividade */}
        <div className="flex items-center gap-1 px-5 pt-3">
          <button
            onClick={() => setTab("comments")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              tab === "comments" ? "bg-o2-green/10 text-o2-green" : "text-ink-dim hover:text-ink"
            )}
          >
            <MessageSquare size={12} />
            Comentários {comments.length > 0 && `(${comments.length})`}
          </button>
          <button
            onClick={() => setTab("activity")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              tab === "activity" ? "bg-o2-green/10 text-o2-green" : "text-ink-dim hover:text-ink"
            )}
          >
            <History size={12} />
            Atividade
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "comments" ? (
            comments.length === 0 ? (
              <p className="text-xs text-ink-ghost text-center py-8">Nenhum comentário ainda. Use @nome para mencionar alguém.</p>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green text-xs font-bold shrink-0">
                      {(c.user.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-ink">{c.user.name || "Usuário"}</span>
                        <span className="text-[10px] text-ink-faint">
                          {format(new Date(c.createdAt), "dd MMM 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft mt-0.5 leading-relaxed break-words">
                        {c.content.split(/(@[\p{L}]+)/gu).map((part, i) =>
                          part.startsWith("@")
                            ? <span key={i} className="text-o2-green font-medium">{part}</span>
                            : part
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )
          ) : activity === null ? (
            <p className="text-xs text-ink-ghost text-center py-8">Carregando…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-ink-ghost text-center py-8">Nenhuma atividade registrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-surface-3 border border-border shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-ink-soft leading-snug">
                      {a.userName && <span className="font-semibold text-ink">{a.userName.split(" ")[0]} </span>}
                      <span className="text-ink-mid">{activityVerb(a.type)}</span>
                      {a.detail && <span className="text-ink-dim"> · {a.detail}</span>}
                    </p>
                    <p className="text-[10px] text-ink-faint mt-0.5">
                      {format(new Date(a.createdAt), "dd MMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comment input */}
        {tab === "comments" && (
          <form onSubmit={submitComment} className="px-5 py-4 border-t border-surface-3">
            <div className="flex gap-2 items-end">
              <div className="w-7 h-7 rounded-full bg-o2-green/20 flex items-center justify-center text-o2-green text-xs font-bold shrink-0">
                {(session?.user?.name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(e as unknown as React.FormEvent); } }}
                  placeholder="Escreva um comentário… @nome menciona no Slack"
                  rows={2}
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none pr-10"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  className="absolute right-2.5 bottom-2.5 text-o2-green disabled:text-border transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function activityVerb(type: string): string {
  const map: Record<string, string> = {
    created: "criou a tarefa",
    status: "mudou o status",
    assignee: "mudou o responsável",
    due_date: "mudou o prazo",
    priority: "mudou a prioridade",
    title: "renomeou a tarefa",
  };
  return map[type] ?? "atualizou a tarefa";
}

function MetaRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={13} className="text-ink-faint shrink-0" />
      <span className="text-xs text-ink-faint w-20 shrink-0">{label}</span>
      {children}
    </div>
  );
}
