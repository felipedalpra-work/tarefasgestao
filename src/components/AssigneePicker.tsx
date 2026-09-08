"use client";

import { X, Plus, Users } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { CLIENT_CHOICE, type AssigneeInput } from "@/lib/task-assignees";
import type { UserOption } from "@/types/task";

// Seletor de responsáveis usado nos três fluxos (nova tarefa, edição da tarefa e
// aceitação de sugestão da IA) — a regra de "o primeiro é o dono" e de quando vira
// tarefa em conjunto mora aqui, pra não divergir entre as telas.
export function AssigneePicker({
  users,
  client,
  value,
  onChange,
  compact = false,
}: {
  users: UserOption[];
  client: string;
  value: AssigneeInput[];
  onChange: (next: AssigneeInput[]) => void;
  compact?: boolean;
}) {
  const joint = value.length > 1;
  const chosen = new Set(value.map((v) => v.id));
  const available = users.filter((u) => !chosen.has(u.id));
  const clientAvailable = client.trim() && !chosen.has(CLIENT_CHOICE);

  function labelOf(id: string): { name: string; image: string | null; isClient: boolean } {
    if (id === CLIENT_CHOICE) return { name: `Cliente (${client.trim()})`, image: null, isClient: true };
    const u = users.find((x) => x.id === id);
    return { name: u?.name || u?.email || "—", image: u?.image ?? null, isClient: false };
  }

  function add(id: string) {
    if (!id || chosen.has(id)) return;
    onChange([...value, { id, part: null }]);
  }
  function remove(id: string) {
    onChange(value.filter((v) => v.id !== id));
  }
  function setPart(id: string, part: string) {
    onChange(value.map((v) => (v.id === id ? { ...v, part } : v)));
  }

  const inputCls =
    "w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-ink-dim">Responsáveis</label>
        {joint && (
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-o2-green">
            <Users size={10} />
            Em conjunto
          </span>
        )}
      </div>

      {value.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {value.map((item, i) => {
            const { name, image, isClient } = labelOf(item.id);
            return (
              <div key={item.id} className="bg-surface-2 border border-border rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-2">
                  {isClient ? (
                    <span className="w-7 h-7 rounded-full bg-surface-3 text-ink-mid flex items-center justify-center text-[10px] font-bold shrink-0">
                      CLI
                    </span>
                  ) : (
                    <UserAvatar name={name} image={image} size="sm" index={i} />
                  )}
                  <span className="text-sm text-ink truncate flex-1">{name}</span>
                  {i === 0 && joint && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-o2-green bg-o2-green/10 px-1.5 py-0.5 rounded shrink-0">
                      Dono
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="text-ink-faint hover:text-red-400 transition-colors shrink-0"
                    title="Tirar da tarefa"
                  >
                    <X size={14} />
                  </button>
                </div>
                {joint && (
                  <input
                    value={item.part ?? ""}
                    onChange={(e) => setPart(item.id, e.target.value)}
                    placeholder="O que cabe a essa pessoa (opcional)"
                    className="mt-1.5 w-full bg-surface border border-border rounded px-2 py-1 text-xs text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(available.length > 0 || clientAvailable) && (
        <div className="relative">
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            className={inputCls}
          >
            <option value="">
              {value.length === 0 ? "Escolher responsável…" : "+ Adicionar mais um responsável…"}
            </option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
            {clientAvailable && <option value={CLIENT_CHOICE}>Cliente ({client.trim()})</option>}
          </select>
          <Plus size={13} className="absolute right-8 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        </div>
      )}

      {!compact && (
        <p className="text-xs text-ink-faint mt-1.5">
          {!client.trim() && "Preencha o Cliente acima pra poder incluir o cliente como responsável. "}
          {joint
            ? "A tarefa aparece pro Kanban e pra lista de todos, e cada um marca a sua parte. Só fica concluída quando todas estiverem marcadas. A cobrança de prazo é do dono."
            : value.length === 1
            ? "Adicione mais alguém pra virar uma tarefa em conjunto."
            : "Sem responsável definido."}
        </p>
      )}
    </div>
  );
}
