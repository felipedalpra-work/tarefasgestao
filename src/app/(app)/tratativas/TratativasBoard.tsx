"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { TratativaCard, type TratativaData } from "@/components/TratativaCard";
import { NewTratativaForm } from "@/components/NewTratativaForm";

type UserOption = { id: string; name: string | null };

const FILTERS = [
  { key: "abertas", label: "Abertas" },
  { key: "triagem", label: "Triagem" },
  { key: "em_tratativa", label: "Em tratativa" },
  { key: "plano_de_acao", label: "Plano de ação" },
  { key: "concluida", label: "Concluídas" },
  { key: "todas", label: "Todas" },
] as const;

export function TratativasBoard({
  tratativas: initial,
  users,
  clientOptions,
}: {
  tratativas: TratativaData[];
  users: UserOption[];
  clientOptions: string[];
}) {
  const [tratativas, setTratativas] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("abertas");

  const shown = tratativas.filter((t) => {
    if (filter === "todas") return true;
    if (filter === "abertas") return t.status !== "concluida";
    return t.status === filter;
  });

  const counts = {
    abertas: tratativas.filter((t) => t.status !== "concluida").length,
    reativas: tratativas.filter((t) => t.status !== "concluida" && t.tipo === "reativa").length,
  };

  return (
    <div className="space-y-6">
      {counts.reativas > 0 && (
        <div className="flex items-center gap-2 bg-red-400/10 border border-red-400/20 text-red-400 rounded-xl px-4 py-3 text-sm">
          <ShieldAlert size={16} />
          {counts.reativas} tratativa{counts.reativas > 1 ? "s" : ""} reativa{counts.reativas > 1 ? "s" : ""} (pedido de churn) em aberto — recuperação é baixa, priorize.
        </div>
      )}

      <NewTratativaForm clientOptions={clientOptions} onCreated={(t) => setTratativas((prev) => [t, ...prev])} />

      <div className="flex gap-1 bg-surface border border-surface-3 rounded-xl p-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition-all",
              filter === f.key ? "bg-o2-green/10 text-o2-green" : "text-ink-dim hover:text-ink hover:bg-surface-2"
            )}
          >
            {f.label}
            {f.key === "abertas" && counts.abertas > 0 && ` (${counts.abertas})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <ShieldAlert size={32} className="text-border mb-3" />
            <p className="text-sm text-ink-faint">Nenhuma tratativa nessa visão.</p>
          </div>
        ) : (
          shown.map((t) => (
            <TratativaCard
              key={t.id}
              tratativa={t}
              users={users}
              showClientLink
              onChange={(updated) => setTratativas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
            />
          ))
        )}
      </div>
    </div>
  );
}
