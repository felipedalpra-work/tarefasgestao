"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "./Toaster";

type User = { id: string; name?: string | null; email: string };

export function NewTaskModal({
  users,
  currentUserId,
  onClose,
  onCreated,
  defaultClient,
}: {
  users: User[];
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
  defaultClient?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [dueDate, setDueDate] = useState("");
  const [client, setClient] = useState(defaultClient ?? "");
  const [deliverTo, setDeliverTo] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setClientOptions(data); })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority,
        assigneeId,
        dueDate: dueDate || null,
        client: client.trim() || null,
        deliverTo: deliverTo || null,
        recurrence: recurrence || null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast("Tarefa criada", "success");
      onCreated();
      onClose();
    } else {
      toast("Erro ao criar a tarefa", "error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-surface border border-surface-3 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-in-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <h2 className="text-base font-semibold text-ink">Nova Tarefa</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={3}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green transition-colors"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Prazo</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Cliente</label>
              <input
                list="client-options"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Opcional"
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-o2-green transition-colors"
              />
              <datalist id="client-options">
                {clientOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Recorrência</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green transition-colors"
              >
                <option value="">Nenhuma</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quinzenal</option>
                <option value="monthly">Mensal</option>
              </select>
            </div>
          </div>

          {client.trim() && (
            <div>
              <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Entrega</label>
              <select
                value={deliverTo}
                onChange={(e) => setDeliverTo(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green transition-colors"
              >
                <option value="">Interna (não aparece no calendário)</option>
                <option value="client">O2 entrega para o cliente</option>
                <option value="o2">Cliente entrega para a O2</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-ink-mid uppercase tracking-wide">Responsável</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green transition-colors"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-ink-mid hover:text-ink hover:border-ink-ghost transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-o2-green text-bg text-sm font-bold hover:bg-o2-green-bright transition-all disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar Tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
