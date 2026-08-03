"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Plus, XCircle, ExternalLink, Workflow, AlertTriangle, Pencil, Check, Trash2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";
import { DeadlineConfirmModal } from "@/components/DeadlineConfirmModal";

type SuggestionStatus = "pending" | "accepted" | "edited" | "rejected" | "duplicate";

type Suggestion = {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string | null;
  dueDate: string | null;
  status: SuggestionStatus;
  duplicateNote?: string | null;
};

type Recap = {
  id: string;
  subject: string;
  createdAt: string;
  client?: string | null;
  suggestions: Suggestion[];
};

type ExternalSuggestion = {
  id: string;
  source: string;
  sourceRef: string | null;
  title: string;
  description: string | null;
  client: string | null;
  priority: string | null;
  dueDate: string | null;
  status: SuggestionStatus;
  duplicateNote?: string | null;
  meetingTitle?: string | null;
  meetingDate?: string | null;
  createdAt: string;
};

type User = { id: string; name?: string | null; email: string };

type Row =
  | { kind: "recap"; recap: Recap; suggestion: Suggestion; sortDate: string }
  | { kind: "external"; suggestion: ExternalSuggestion; sortDate: string };

type Tab = "pending" | "duplicate" | "rejected";

// valor sentinela pro select de responsável — indica "atribuir ao cliente" em vez de uma pessoa do squad
const CLIENT_CHOICE = "__client__";

// campos da sugestão que dá pra editar antes de mandar pro Kanban (mesmo conjunto do lapizinho de TaskDetailPanel)
type EditableFields = {
  title: string;
  description: string;
  priority: string;
  dueDate: string; // yyyy-mm-dd ou ""
  client: string;
  assigneeId: string; // "" = padrão (quem clicar em Adicionar), ou id de usuário, ou CLIENT_CHOICE
};

export default function SugestoesIaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [deadlinePrompt, setDeadlinePrompt] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [overrides, setOverrides] = useState<Record<string, EditableFields>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableFields | null>(null);

  async function load() {
    const [recapsRes, usersRes, externalRes] = await Promise.all([
      fetch("/api/recaps"),
      fetch("/api/users"),
      fetch("/api/suggestions/external"),
    ]);
    const recaps: Recap[] = await recapsRes.json();
    const u = await usersRes.json();
    const external: ExternalSuggestion[] = await externalRes.json();
    if (Array.isArray(u)) setUsers(u);

    const flat: Row[] = [];
    for (const recap of recaps) {
      for (const suggestion of recap.suggestions) {
        if (suggestion.status === "pending" || suggestion.status === "duplicate" || suggestion.status === "rejected") {
          flat.push({ kind: "recap", recap, suggestion, sortDate: recap.createdAt });
        }
      }
    }
    if (Array.isArray(external)) {
      for (const suggestion of external) {
        if (suggestion.status === "pending" || suggestion.status === "duplicate" || suggestion.status === "rejected") {
          flat.push({ kind: "external", suggestion, sortDate: suggestion.createdAt });
        }
      }
    }
    flat.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
    setRows(flat);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  const pendingRows = useMemo(() => rows.filter((r) => r.suggestion.status === "pending"), [rows]);
  const duplicateRows = useMemo(() => rows.filter((r) => r.suggestion.status === "duplicate"), [rows]);
  const rejectedRows = useMemo(() => rows.filter((r) => r.suggestion.status === "rejected"), [rows]);
  const visibleRows = tab === "pending" ? pendingRows : tab === "duplicate" ? duplicateRows : rejectedRows;

  // troca o status localmente (sem refetch) — assim a sugestão migra na hora entre as
  // abas (Pendente/Duplicada ↔ Excluídos), preservando o resto do estado local
  function withStatus(prev: Row[], id: string, status: SuggestionStatus): Row[] {
    return prev.map((r) => {
      if (r.suggestion.id !== id) return r;
      if (r.kind === "recap") return { ...r, suggestion: { ...r.suggestion, status } };
      return { ...r, suggestion: { ...r.suggestion, status } };
    });
  }

  function matchAssigneeId(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    const found = users.find((u) => u.name?.toLowerCase().split(" ").some((part) => lower.includes(part)));
    return found?.id ?? null;
  }

  // valores originais da sugestão, como a IA extraiu (sem nenhuma edição manual)
  function originalEditable(row: Row): EditableFields {
    if (row.kind === "recap") {
      const s = row.suggestion;
      return {
        title: s.title,
        description: s.description ?? "",
        priority: s.priority || "medium",
        dueDate: s.dueDate ? s.dueDate.slice(0, 10) : "",
        client: row.recap.client ?? "",
        assigneeId: matchAssigneeId(s.assignee) ?? "",
      };
    }
    const s = row.suggestion;
    return {
      title: s.title,
      description: s.description ?? "",
      priority: s.priority || "medium",
      dueDate: s.dueDate ? s.dueDate.slice(0, 10) : "",
      client: s.client ?? "",
      assigneeId: "",
    };
  }

  // valor efetivo (editado, se a pessoa já mexeu; senão o original da IA)
  function getEditable(row: Row): EditableFields {
    return overrides[row.suggestion.id] ?? originalEditable(row);
  }

  function assigneeLabel(editable: EditableFields, row: Row): string | null {
    if (editable.assigneeId === CLIENT_CHOICE) return "Cliente";
    if (editable.assigneeId) {
      const u = users.find((x) => x.id === editable.assigneeId);
      return u?.name || u?.email || null;
    }
    if (row.kind === "recap" && row.suggestion.assignee) return row.suggestion.assignee;
    return null;
  }

  function startEdit(row: Row) {
    setEditingId(row.suggestion.id);
    setDraft(getEditable(row));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit(row: Row) {
    if (!draft) return;
    setOverrides((prev) => ({ ...prev, [row.suggestion.id]: draft }));
    setEditingId(null);
    setDraft(null);
  }

  // salva a edição e já cria a tarefa num clique só — usa o prazo do próprio
  // formulário de edição, sem passar pelo modal de confirmação de prazo (redundante
  // aqui, já que o campo "Prazo" acabou de ser editado ali em cima)
  function saveAndAdd(row: Row) {
    if (!draft) return;
    setOverrides((prev) => ({ ...prev, [row.suggestion.id]: draft }));
    setEditingId(null);
    const finalDraft = draft;
    setDraft(null);
    accept(row, finalDraft.dueDate || null, finalDraft);
  }

  async function accept(row: Row, dueDate: string | null, currentOverride?: EditableFields) {
    const key = row.suggestion.id;
    setActingKey(key);
    const original = originalEditable(row);
    const current = currentOverride ?? getEditable(row);
    const edited =
      current.title !== original.title ||
      current.description !== original.description ||
      current.priority !== original.priority ||
      current.client !== original.client ||
      current.assigneeId !== original.assigneeId ||
      dueDate !== (original.dueDate || null);

    const isClientChoice = current.assigneeId === CLIENT_CHOICE;
    const commonFields = {
      title: current.title,
      description: current.description || null,
      priority: current.priority || "medium",
      assigneeId: current.assigneeId && !isClientChoice ? current.assigneeId : null,
      noAssignee: isClientChoice,
      deliverTo: isClientChoice ? "o2" : null,
      dueDate,
      client: current.client || null,
      suggestionEdited: edited,
    };

    const body =
      row.kind === "recap"
        ? {
            ...commonFields,
            source: "meet_recap",
            sourceRef: row.recap.id,
            meetingTitle: row.recap.subject,
            meetingDate: row.recap.createdAt,
            recapSuggestionId: row.suggestion.id,
          }
        : {
            ...commonFields,
            source: "n8n",
            sourceRef: row.suggestion.sourceRef,
            meetingTitle: row.suggestion.meetingTitle ?? null,
            meetingDate: row.suggestion.meetingDate ?? null,
            externalSuggestionId: row.suggestion.id,
          };

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setActingKey(null);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.suggestion.id !== key));
      setOverrides((prev) => { const rest = { ...prev }; delete rest[key]; return rest; });
      toast("Tarefa adicionada ao Kanban", "success");
    } else {
      toast("Erro ao adicionar a tarefa", "error");
    }
  }

  async function reject(row: Row) {
    const key = row.suggestion.id;
    setActingKey(key);
    const url =
      row.kind === "recap"
        ? `/api/recaps/${row.recap.id}/suggestions/${row.suggestion.id}`
        : `/api/suggestions/external/${row.suggestion.id}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    setActingKey(null);
    if (res.ok) {
      setRows((prev) => withStatus(prev, key, "rejected"));
      setOverrides((prev) => { const rest = { ...prev }; delete rest[key]; return rest; });
      toast("Sugestão descartada", "success");
    } else {
      toast("Erro ao salvar", "error");
    }
  }

  // desfaz o descarte — volta pra "Pendentes", de onde já dá pra editar/aceitar normalmente
  async function restore(row: Row) {
    const key = row.suggestion.id;
    setActingKey(key);
    const url =
      row.kind === "recap"
        ? `/api/recaps/${row.recap.id}/suggestions/${row.suggestion.id}`
        : `/api/suggestions/external/${row.suggestion.id}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    setActingKey(null);
    if (res.ok) {
      setRows((prev) => withStatus(prev, key, "pending"));
      toast("Sugestão restaurada — voltou pra Pendentes", "success");
    } else {
      toast("Erro ao restaurar", "error");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Sparkles size={22} className="text-o2-green" />
          Sugestões da IA
        </h1>
        <p className="text-ink-mid text-sm mt-0.5">
          Todas as tarefas que a IA identificou nos Meet Recaps e nos workflows conectados, ainda pendentes de revisão — em um só lugar.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setTab("pending")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            tab === "pending" ? "bg-o2-green/15 text-o2-green" : "bg-surface-2 text-ink-mid hover:text-ink"
          }`}
        >
          Pendentes {loaded && `(${pendingRows.length})`}
        </button>
        <button
          onClick={() => setTab("duplicate")}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            tab === "duplicate" ? "bg-yellow-500/15 text-yellow-400" : "bg-surface-2 text-ink-mid hover:text-ink"
          }`}
        >
          <AlertTriangle size={11} />
          Duplicadas {loaded && `(${duplicateRows.length})`}
        </button>
        <button
          onClick={() => setTab("rejected")}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            tab === "rejected" ? "bg-red-500/15 text-red-400" : "bg-surface-2 text-ink-mid hover:text-ink"
          }`}
        >
          <Trash2 size={11} />
          Excluídos {loaded && `(${rejectedRows.length})`}
        </button>
      </div>

      {!loaded ? (
        <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>
      ) : visibleRows.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <Sparkles size={40} className="text-border mb-4" />
          <p className="text-ink-faint text-sm">
            {tab === "pending" ? "Nenhuma sugestão pendente." : tab === "duplicate" ? "Nenhuma duplicada encontrada." : "Nenhuma sugestão excluída."}
          </p>
          <p className="text-ink-ghost text-xs mt-1">
            {tab === "pending" ? "Tudo revisado — bom trabalho." : tab === "duplicate" ? "A IA não descartou nada por duplicidade." : "Nada foi descartado ainda."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((row) => {
            const { suggestion } = row;
            const acting = actingKey === suggestion.id;
            const isEditing = editingId === suggestion.id;
            const editable = isEditing && draft ? draft : getEditable(row);
            return (
              <div key={suggestion.id} className="bg-surface border border-surface-3 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  {row.kind === "recap" ? (
                    <Link
                      href={`/recaps?recap=${row.recap.id}`}
                      className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-o2-green transition-colors truncate"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="truncate">{row.recap.subject}</span>
                      <span className="shrink-0">· {format(new Date(row.recap.createdAt), "dd 'de' MMM", { locale: ptBR })}</span>
                      {row.recap.client && <span className="shrink-0">· {row.recap.client}</span>}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-ink-faint truncate">
                      <Workflow size={11} className="shrink-0" />
                      <span className="truncate">{row.suggestion.sourceRef || "n8n"}</span>
                      <span className="shrink-0">· {format(new Date(row.suggestion.createdAt), "dd 'de' MMM", { locale: ptBR })}</span>
                      {row.suggestion.client && <span className="shrink-0">· {row.suggestion.client}</span>}
                    </span>
                  )}
                </div>

                {isEditing && draft ? (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs text-ink-dim block mb-1">Título</label>
                      <input
                        value={draft.title}
                        onChange={(e) => setDraft((d) => d && { ...d, title: e.target.value })}
                        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink-dim block mb-1">Descrição</label>
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft((d) => d && { ...d, description: e.target.value })}
                        rows={2}
                        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs text-ink-dim block mb-1">Prioridade</label>
                        <select
                          value={draft.priority}
                          onChange={(e) => setDraft((d) => d && { ...d, priority: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
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
                          value={draft.dueDate}
                          onChange={(e) => setDraft((d) => d && { ...d, dueDate: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs text-ink-dim block mb-1">Cliente</label>
                        <input
                          value={draft.client}
                          onChange={(e) => setDraft((d) => d && { ...d, client: e.target.value })}
                          placeholder="Nome do cliente"
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-ink-dim block mb-1">Responsável</label>
                        <select
                          value={draft.assigneeId}
                          onChange={(e) => setDraft((d) => d && { ...d, assigneeId: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-o2-green/50"
                        >
                          <option value="">Padrão (quem adicionar)</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                          ))}
                          {draft.client && <option value={CLIENT_CHOICE}>Cliente ({draft.client})</option>}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button onClick={cancelEdit} className="text-xs px-3 py-1.5 text-ink-dim hover:text-ink transition-colors">
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveEdit(row)}
                        disabled={!draft.title.trim()}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-surface-3 text-ink-mid font-semibold rounded-lg hover:text-ink disabled:opacity-50 transition-colors"
                      >
                        <Check size={13} />
                        Salvar
                      </button>
                      <button
                        onClick={() => saveAndAdd(row)}
                        disabled={!draft.title.trim() || acting}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-o2-green text-bg font-semibold rounded-lg hover:bg-o2-green-bright disabled:opacity-50 transition-colors"
                      >
                        <Plus size={13} />
                        {acting ? "Adicionando…" : "Salvar e adicionar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-ink">{editable.title}</p>
                    {editable.description && <p className="text-xs text-ink-mid mt-1">{editable.description}</p>}
                    {tab === "duplicate" && suggestion.duplicateNote && (
                      <p className="flex items-start gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-2.5 py-1.5 mt-2">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        {suggestion.duplicateNote}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {assigneeLabel(editable, row) && (
                          <span className="text-xs text-ink-dim">→ {assigneeLabel(editable, row)}</span>
                        )}
                        <span
                          className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                            editable.priority === "high"
                              ? "bg-red-500/20 text-red-400"
                              : editable.priority === "low"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {editable.priority || "média"}
                        </span>
                        {editable.client && <span className="text-xs text-ink-faint">· {editable.client}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tab === "rejected" ? (
                          <button
                            onClick={() => restore(row)}
                            disabled={acting}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium bg-surface-3 text-ink-mid hover:text-ink disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            {acting ? "Restaurando…" : "Restaurar"}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => reject(row)}
                              disabled={acting}
                              className="text-ink-faint hover:text-red-400 p-1.5 transition-colors disabled:opacity-50"
                              title="Descartar sugestão"
                            >
                              <XCircle size={14} />
                            </button>
                            <button
                              onClick={() => startEdit(row)}
                              disabled={acting}
                              className="text-ink-faint hover:text-o2-green p-1.5 transition-colors disabled:opacity-50"
                              title="Editar antes de adicionar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeadlinePrompt(row)}
                              disabled={acting}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium bg-o2-green/10 text-o2-green hover:bg-o2-green/20 disabled:opacity-70"
                            >
                              <Plus size={12} />
                              {acting ? "Adicionando…" : tab === "duplicate" ? "Adicionar mesmo assim" : "Adicionar"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deadlinePrompt && (
        <DeadlineConfirmModal
          title={getEditable(deadlinePrompt).title}
          initialDate={getEditable(deadlinePrompt).dueDate || null}
          onCancel={() => setDeadlinePrompt(null)}
          onConfirm={(date) => {
            accept(deadlinePrompt, date);
            setDeadlinePrompt(null);
          }}
        />
      )}
    </div>
  );
}
