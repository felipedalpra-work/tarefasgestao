"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "@/components/Toaster";

type Fechamento = {
  year: number;
  month: number;
  comiteRealizado: boolean;
  rebalanceamentoFeito: boolean;
  conciliacaoOk: boolean;
  cpCrFechados: boolean;
  pendenciasAnotadas: string | null;
  maturidade: string | null;
  healthReviewedAt: string | null;
};

const CHECKLIST_ITEMS = [
  { key: "comiteRealizado" as const, label: "Comitê realizado e registrado" },
  { key: "rebalanceamentoFeito" as const, label: "Rebalanceamento de caixa e decisões tomadas" },
  { key: "conciliacaoOk" as const, label: "Conciliação OK" },
  { key: "cpCrFechados" as const, label: "CP e CR fechados" },
];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function emptyFechamento(year: number, month: number): Fechamento {
  return {
    year,
    month,
    comiteRealizado: false,
    rebalanceamentoFeito: false,
    conciliacaoOk: false,
    cpCrFechados: false,
    pendenciasAnotadas: null,
    maturidade: null,
    healthReviewedAt: null,
  };
}

export function FechamentoTab({ client }: { client: string }) {
  const [history, setHistory] = useState<Fechamento[]>([]);
  const [selected, setSelected] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${encodeURIComponent(client)}/fechamentos`)
      .then((r) => r.json())
      .then((data: Fechamento[]) => {
        setHistory(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [client]);

  const current = history.find((f) => f.year === selected.year && f.month === selected.month) ?? emptyFechamento(selected.year, selected.month);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/clients/${encodeURIComponent(client)}/fechamentos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: selected.year, month: selected.month, ...data }),
    });
    if (!res.ok) {
      toast("Erro ao salvar", "error");
      return;
    }
    const updated = await res.json();
    setHistory((prev) => {
      const others = prev.filter((f) => !(f.year === selected.year && f.month === selected.month));
      return [updated, ...others].sort((a, b) => (b.year - a.year) || (b.month - a.month));
    });
  }

  function toggle(key: (typeof CHECKLIST_ITEMS)[number]["key"]) {
    patch({ [key]: !current[key] });
  }

  function changeMonth(delta: number) {
    let { year, month } = selected;
    month += delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    setSelected({ year, month });
  }

  if (!loaded) return <p className="text-xs text-ink-faint text-center py-8">Carregando…</p>;

  const doneCount = CHECKLIST_ITEMS.filter((i) => current[i.key]).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(-1)} className="text-xs text-ink-dim hover:text-ink px-2 py-1">← anterior</button>
        <p className="text-sm font-semibold text-ink">{MONTH_LABELS[selected.month - 1]} / {selected.year}</p>
        <button onClick={() => changeMonth(1)} className="text-xs text-ink-dim hover:text-ink px-2 py-1">próximo →</button>
      </div>

      <div className="bg-surface border border-surface-3 rounded-xl p-4 space-y-2">
        {CHECKLIST_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className="flex items-center gap-2.5 w-full text-left py-1.5"
          >
            {current[key] ? (
              <CheckCircle2 size={17} className="text-o2-green shrink-0" />
            ) : (
              <Circle size={17} className="text-ink-ghost shrink-0" />
            )}
            <span className={current[key] ? "text-sm text-ink" : "text-sm text-ink-dim"}>{label}</span>
          </button>
        ))}
        <p className="text-xs text-ink-faint pt-1">{doneCount}/{CHECKLIST_ITEMS.length} concluídos</p>
      </div>

      <div>
        <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Pendências anotadas</label>
        <textarea
          key={`pendencias-${selected.year}-${selected.month}`}
          defaultValue={current.pendenciasAnotadas ?? ""}
          onBlur={(e) => e.target.value !== (current.pendenciasAnotadas ?? "") && patch({ pendenciasAnotadas: e.target.value || null })}
          rows={2}
          className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-o2-green/50 resize-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-ink-mid uppercase tracking-wide block mb-1.5">Maturidade do fechamento</label>
        <textarea
          key={`maturidade-${selected.year}-${selected.month}`}
          defaultValue={current.maturidade ?? ""}
          onBlur={(e) => e.target.value !== (current.maturidade ?? "") && patch({ maturidade: e.target.value || null })}
          rows={2}
          placeholder="Avaliação livre: o quanto o fechamento deste mês está maduro/confiável"
          className="w-full bg-surface border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-ghost focus:outline-none focus:border-o2-green/50 resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-ink-faint">Status de saúde revisado em:</label>
        <input
          type="date"
          value={current.healthReviewedAt ? new Date(current.healthReviewedAt).toISOString().slice(0, 10) : ""}
          onChange={(e) => patch({ healthReviewedAt: e.target.value || null })}
          className="bg-surface border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-ink-soft focus:outline-none focus:border-o2-green/50"
        />
      </div>

      {history.length > 0 && (
        <div className="border-t border-surface-3 pt-3">
          <p className="text-xs font-medium text-ink-mid uppercase tracking-wide mb-2">Histórico</p>
          <div className="flex flex-wrap gap-1.5">
            {history.map((f) => {
              const count = CHECKLIST_ITEMS.filter((i) => f[i.key]).length;
              const isSelected = f.year === selected.year && f.month === selected.month;
              return (
                <button
                  key={`${f.year}-${f.month}`}
                  onClick={() => setSelected({ year: f.year, month: f.month })}
                  className={
                    "text-xs px-2.5 py-1 rounded-lg transition-all " +
                    (isSelected
                      ? "bg-o2-green/10 text-o2-green"
                      : count === CHECKLIST_ITEMS.length
                      ? "bg-surface-3 text-ink-soft hover:text-ink"
                      : "bg-surface-3 text-ink-faint hover:text-ink")
                  }
                >
                  {MONTH_LABELS[f.month - 1].slice(0, 3)}/{f.year} ({count}/{CHECKLIST_ITEMS.length})
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
