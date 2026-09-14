"use client";

import { useEffect, useState } from "react";
import { BarChart2, TrendingUp, TrendingDown, AlertTriangle, ListChecks, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeeklyTrendChart, type WeeklyTrendPoint } from "@/components/WeeklyTrendChart";
import { WorkloadBars, type WorkloadRow } from "@/components/WorkloadBars";
import { toast } from "@/components/Toaster";

type PerformanceData = {
  weeks: number;
  weeklyChart: WeeklyTrendPoint[];
  workload: WorkloadRow[];
  kpis: { completedThisWeek: number; completedPrevWeek: number | null; onTimeRatio: number | null; overdueNow: number; openNow: number };
};

const WEEK_PRESETS = [4, 8, 12];

function StatTile({
  icon: Icon, iconClass, label, value, delta,
}: {
  icon: typeof BarChart2; iconClass: string; label: string; value: string; delta?: { value: number; goodDirection: "up" | "down" } | null;
}) {
  const deltaUp = delta ? delta.value > 0 : null;
  const deltaGood = delta ? (delta.goodDirection === "up" ? deltaUp : !deltaUp) : null;
  return (
    <div className="bg-surface border border-surface-3 rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 text-ink-faint mb-2">
        <Icon size={13} className={iconClass} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-ink">{value}</span>
        {delta && delta.value !== 0 && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium mb-1", deltaGood ? "text-o2-green" : "text-red-400")}>
            {deltaUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(delta.value)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DesempenhoPage() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dashboard/performance?weeks=${weeks}`)
      .then((r) => r.json())
      .then((json: PerformanceData) => setData(json))
      .catch(() => toast("Erro ao carregar o desempenho do squad", "error"))
      .finally(() => setLoading(false));
  }, [weeks]);

  // troca de período: mantém o gráfico anterior visível (esmaecido) em vez de
  // sumir e voltar do zero — só o clique dispara o "carregando", nunca o efeito
  function selectWeeks(w: number) {
    if (w === weeks) return;
    setLoading(true);
    setWeeks(w);
  }

  const kpis = data?.kpis;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Desempenho do Squad</h1>
          <p className="text-ink-mid mt-1 text-sm">Velocidade de conclusão, prazo e carga da equipe ao longo do tempo</p>
        </div>

        {/* filtro de período — em cima, escopa tudo abaixo */}
        <div className="flex items-center gap-1 bg-surface border border-surface-3 rounded-lg p-1">
          {WEEK_PRESETS.map((w) => (
            <button
              key={w}
              onClick={() => selectWeeks(w)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                weeks === w ? "bg-o2-green/15 text-o2-green" : "text-ink-mid hover:text-ink"
              )}
            >
              {w} semanas
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-ink-faint">Carregando…</p>
      ) : !data ? (
        <p className="text-sm text-ink-faint">Não foi possível carregar os dados.</p>
      ) : (
        <div className={cn("transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatTile
              icon={ListChecks}
              iconClass="text-o2-green"
              label="Concluídas essa semana"
              value={String(kpis!.completedThisWeek)}
              delta={kpis!.completedPrevWeek !== null ? { value: kpis!.completedThisWeek - kpis!.completedPrevWeek, goodDirection: "up" } : null}
            />
            <StatTile
              icon={TrendingUp}
              iconClass="text-blue-400"
              label="Concluídas no prazo"
              value={kpis!.onTimeRatio !== null ? `${Math.round(kpis!.onTimeRatio * 100)}%` : "—"}
            />
            <StatTile
              icon={AlertTriangle}
              iconClass={kpis!.overdueNow > 0 ? "text-red-400" : "text-ink-faint"}
              label="Atrasadas agora"
              value={String(kpis!.overdueNow)}
            />
            <StatTile icon={BarChart2} iconClass="text-ink-mid" label="Tarefas em aberto" value={String(kpis!.openNow)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-surface border border-surface-3 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 size={15} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Velocidade de conclusão</h2>
              </div>
              {data.weeklyChart.every((w) => w.onTime + w.late + w.noDueDate === 0) ? (
                <p className="text-sm text-ink-faint text-center py-16">Nenhuma tarefa concluída nesse período</p>
              ) : (
                <WeeklyTrendChart data={data.weeklyChart} />
              )}
            </div>

            <div className="bg-surface border border-surface-3 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users size={15} className="text-o2-green" />
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Carga em aberto por pessoa</h2>
              </div>
              <WorkloadBars rows={data.workload} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
