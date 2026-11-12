"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { TratativaCard, type TratativaData } from "@/components/TratativaCard";
import { NewTratativaForm } from "@/components/NewTratativaForm";
import type { ClienteEmTratativaPipefy } from "@/lib/pipefy";

type UserOption = { id: string; name: string | null };

// Pipefy devolve a data como MM/DD/YYYY — exibe dd/mm/aaaa (mesmo padrão de SaudeCarteiraView).
function fmtData(d: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim());
  if (!m) return d || "—";
  return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]}`;
}

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
  pipefySuggestions: initialPipefySuggestions,
}: {
  tratativas: TratativaData[];
  users: UserOption[];
  clientOptions: string[];
  pipefySuggestions: ClienteEmTratativaPipefy[];
}) {
  const [tratativas, setTratativas] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("abertas");
  const [pipefySuggestions, setPipefySuggestions] = useState(initialPipefySuggestions);
  const [pendingSuggestion, setPendingSuggestion] = useState<ClienteEmTratativaPipefy | null>(null);

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

      {pipefySuggestions.length > 0 && (
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3 text-sm space-y-3">
          <p className="flex items-center gap-2 text-amber-400">
            <ShieldAlert size={16} />
            Pipefy indica {pipefySuggestions.length} cliente{pipefySuggestions.length > 1 ? "s" : ""} em tratativa sem registro aqui
          </p>
          <div className="space-y-2">
            {pipefySuggestions.map((s) => (
              <div key={s.client} className="rounded-lg border border-amber-400/20 bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{s.client}</p>
                    <p className="text-xs text-ink-dim mt-0.5">
                      {s.responsavel && <>Responsável: {s.responsavel}</>}
                      {s.statusProjeto && <> · Status: {s.statusProjeto}</>}
                      {s.ultimaInteracao && <> · Última interação: {fmtData(s.ultimaInteracao)}</>}
                    </p>
                    {s.feedbackCliente && (
                      <p className="text-xs text-ink-faint mt-1.5 line-clamp-3">💬 {s.feedbackCliente}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingSuggestion(s)}
                    className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors"
                  >
                    + Abrir tratativa
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <NewTratativaForm
        key={pendingSuggestion?.client ?? "default"}
        clientOptions={clientOptions}
        initialClient={pendingSuggestion?.client}
        initialDescricao={pendingSuggestion?.feedbackCliente ? `Contexto do Pipefy: ${pendingSuggestion.feedbackCliente}` : undefined}
        autoOpen={!!pendingSuggestion}
        onCreated={(t) => {
          setTratativas((prev) => [t, ...prev]);
          setPipefySuggestions((prev) => prev.filter((s) => s.client !== t.client));
          setPendingSuggestion(null);
        }}
      />

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
