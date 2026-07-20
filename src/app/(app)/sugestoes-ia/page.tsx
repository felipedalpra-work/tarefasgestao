"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Plus, XCircle, ExternalLink, Workflow } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";
import { DeadlineConfirmModal } from "@/components/DeadlineConfirmModal";

type Suggestion = {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string | null;
  dueDate: string | null;
  status: "pending" | "accepted" | "edited" | "rejected";
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
  status: "pending" | "accepted" | "edited" | "rejected";
  createdAt: string;
};

type User = { id: string; name?: string | null; email: string };

type Row =
  | { kind: "recap"; recap: Recap; suggestion: Suggestion; sortDate: string }
  | { kind: "external"; suggestion: ExternalSuggestion; sortDate: string };

export default function SugestoesIaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [deadlinePrompt, setDeadlinePrompt] = useState<Row | null>(null);

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
        if (suggestion.status === "pending") {
          flat.push({ kind: "recap", recap, suggestion, sortDate: recap.createdAt });
        }
      }
    }
    if (Array.isArray(external)) {
      for (const suggestion of external) {
        if (suggestion.status === "pending") {
          flat.push({ kind: "external", suggestion, sortDate: suggestion.createdAt });
        }
      }
    }
    flat.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
    setRows(flat);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  function matchAssigneeId(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    const found = users.find((u) => u.name?.toLowerCase().split(" ").some((part) => lower.includes(part)));
    return found?.id ?? null;
  }

  async function accept(row: Row, dueDate: string | null) {
    const key = row.suggestion.id;
    setActingKey(key);
    const originalDate = row.suggestion.dueDate ? row.suggestion.dueDate.slice(0, 10) : null;
    const edited = dueDate !== originalDate;

    const body =
      row.kind === "recap"
        ? {
            title: row.suggestion.title,
            description: row.suggestion.description,
            priority: row.suggestion.priority || "medium",
            assigneeId: matchAssigneeId(row.suggestion.assignee),
            dueDate,
            source: "meet_recap",
            sourceRef: row.recap.id,
            client: row.recap.client ?? null,
            recapSuggestionId: row.suggestion.id,
            suggestionEdited: edited,
          }
        : {
            title: row.suggestion.title,
            description: row.suggestion.description,
            priority: row.suggestion.priority || "medium",
            dueDate,
            source: "n8n",
            sourceRef: row.suggestion.sourceRef,
            client: row.suggestion.client,
            externalSuggestionId: row.suggestion.id,
            suggestionEdited: edited,
          };

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setActingKey(null);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.suggestion.id !== key));
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
      setRows((prev) => prev.filter((r) => r.suggestion.id !== key));
    } else {
      toast("Erro ao salvar", "error");
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

      {!loaded ? (
        <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <Sparkles size={40} className="text-border mb-4" />
          <p className="text-ink-faint text-sm">Nenhuma sugestão pendente.</p>
          <p className="text-ink-ghost text-xs mt-1">Tudo revisado — bom trabalho.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const { suggestion } = row;
            const acting = actingKey === suggestion.id;
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

                <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                {suggestion.description && <p className="text-xs text-ink-mid mt-1">{suggestion.description}</p>}

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    {row.kind === "recap" && row.suggestion.assignee && (
                      <span className="text-xs text-ink-dim">→ {row.suggestion.assignee}</span>
                    )}
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        suggestion.priority === "high"
                          ? "bg-red-500/20 text-red-400"
                          : suggestion.priority === "low"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {suggestion.priority || "média"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => reject(row)}
                      disabled={acting}
                      className="text-ink-faint hover:text-red-400 p-1.5 transition-colors disabled:opacity-50"
                      title="Descartar sugestão"
                    >
                      <XCircle size={14} />
                    </button>
                    <button
                      onClick={() => setDeadlinePrompt(row)}
                      disabled={acting}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium bg-o2-green/10 text-o2-green hover:bg-o2-green/20 disabled:opacity-70"
                    >
                      <Plus size={12} />
                      {acting ? "Adicionando…" : "Adicionar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deadlinePrompt && (
        <DeadlineConfirmModal
          title={deadlinePrompt.suggestion.title}
          initialDate={deadlinePrompt.suggestion.dueDate}
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
