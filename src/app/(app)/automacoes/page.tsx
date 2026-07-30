"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Play, Pause, PlayCircle, CheckCircle2, XCircle, Clock, Zap,
  Activity, TrendingUp, AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

type Automation = {
  id: string;
  key: string;
  name: string;
  client: string | null;
  scheduleLabel: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: string | null;
  lastError: string | null;
  pendingCommand: string | null;
};

type AutomationStat = {
  key: string;
  name: string;
  totalRuns: number;
  successCount: number;
  errorCount: number;
  recentRuns: { status: string; finishedAt: string }[];
};

type Stats = {
  totalRuns30d: number;
  successRate30d: number | null;
  errorRuns30d: number;
  mostUsed: { name: string; key: string; totalRuns: number } | null;
  perAutomation: AutomationStat[];
  recentErrors: { automationName: string; finishedAt: string; summary: string | null; detail: string | null }[];
};

export default function AutomacoesPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, statsRes] = await Promise.all([
        fetch("/api/automations"),
        fetch("/api/automations/stats"),
      ]);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error("[automacoes]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function sendCommand(automation: Automation, type: "trigger" | "pause" | "resume") {
    setBusyId(automation.id);
    try {
      const res = await fetch(`/api/automations/${automation.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Erro ao enviar comando", "error");
        return;
      }
      const messages: Record<string, string> = {
        trigger: `"${automation.name}" solicitada — deve rodar em alguns minutos`,
        pause: `"${automation.name}" pausada`,
        resume: `"${automation.name}" reativada`,
      };
      toast(messages[type], "success");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <Zap size={20} className="text-o2-green" />
            Automações
          </h1>
          <p className="text-ink-mid text-sm mt-0.5">
            Rotinas de extração e upload pra Oxy que rodam fora do app (agendadas no Claude/Cowork)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-xl bg-surface border border-surface-3 text-ink-mid hover:text-ink transition-all"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {stats && (
        <div className="bg-surface border border-surface-3 rounded-xl px-5 py-4 mb-6 flex items-center gap-6 md:gap-10 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Activity size={15} className="text-ink-mid" />
            <span className="text-xl font-bold text-ink">{stats.totalRuns30d}</span>
            <span className="text-xs text-ink-mid">Execuções (30d)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={15} className={stats.errorRuns30d > 0 ? "text-yellow-400" : "text-o2-green"} />
            <span className="text-xl font-bold text-ink">
              {stats.successRate30d === null ? "—" : `${stats.successRate30d}%`}
            </span>
            <span className="text-xs text-ink-mid">Taxa de sucesso (30d)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <XCircle size={15} className={stats.errorRuns30d > 0 ? "text-red-400" : "text-ink-faint"} />
            <span className="text-xl font-bold text-ink">{stats.errorRuns30d}</span>
            <span className="text-xs text-ink-mid">Erros (30d)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <TrendingUp size={15} className="text-ink-mid" />
            <span className="text-xl font-bold text-ink truncate max-w-[160px]">
              {stats.mostUsed ? stats.mostUsed.name : "—"}
            </span>
            <span className="text-xs text-ink-mid">
              Mais usada{stats.mostUsed ? ` (${stats.mostUsed.totalRuns}x)` : ""}
            </span>
          </div>
        </div>
      )}

      {stats && stats.recentErrors.length > 0 && (
        <div className="bg-surface border border-red-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-red-400" />
            <h2 className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Erros recentes</h2>
          </div>
          <div className="space-y-2">
            {stats.recentErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-ink font-medium shrink-0">{e.automationName}</span>
                <span className="text-ink-faint shrink-0">
                  {formatDistanceToNow(new Date(e.finishedAt), { addSuffix: true, locale: ptBR })}
                </span>
                {(e.detail || e.summary) && (
                  <span className="text-red-400 truncate">{e.detail || e.summary}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((a) => {
          const cardStats = stats?.perAutomation.find((s) => s.key === a.key);
          const isBusy = busyId === a.id;
          const statusBadge = !a.enabled
            ? { label: "Pausada", cls: "bg-surface-3 text-ink-faint", Icon: Pause }
            : a.pendingCommand
            ? { label: "Processando…", cls: "bg-yellow-400/10 text-yellow-400", Icon: Clock }
            : a.lastStatus === "error"
            ? { label: "Erro", cls: "bg-red-400/10 text-red-400", Icon: XCircle }
            : a.lastStatus === "success"
            ? { label: "OK", cls: "bg-o2-green/10 text-o2-green", Icon: CheckCircle2 }
            : { label: "Nunca rodou", cls: "bg-surface-3 text-ink-faint", Icon: Clock };
          const StatusIcon = statusBadge.Icon;

          return (
            <div
              key={a.id}
              className="rounded-xl p-4 border bg-surface border-surface-3 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-ink">{a.name}</h2>
                    {a.client && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-surface-3 text-ink-faint">
                        {a.client}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge.cls}`}>
                      <StatusIcon size={10} />
                      {statusBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-ink-faint mt-1">{a.scheduleLabel}</p>
                  {a.lastRunAt && (
                    <p className="text-xs text-ink-dim mt-1">
                      Última execução {formatDistanceToNow(new Date(a.lastRunAt), { addSuffix: true, locale: ptBR })}
                      {a.lastStatus === "error" && a.lastError ? `: ${a.lastError}` : a.lastSummary ? ` — ${a.lastSummary}` : ""}
                    </p>
                  )}
                  {cardStats && cardStats.totalRuns > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="flex items-center gap-0.5">
                        {[...cardStats.recentRuns].reverse().map((r, i) => (
                          <span
                            key={i}
                            title={`${r.status === "success" ? "Sucesso" : "Erro"} · ${format(new Date(r.finishedAt), "dd/MM/yyyy HH:mm")}`}
                            className={cn(
                              "w-2 h-2 rounded-sm",
                              r.status === "success" ? "bg-o2-green" : "bg-red-400"
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-ink-faint">
                        {cardStats.successCount}/{cardStats.totalRuns} sucesso
                        {cardStats.errorCount > 0 && ` · ${cardStats.errorCount} erro${cardStats.errorCount > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => sendCommand(a, "trigger")}
                    disabled={isBusy || Boolean(a.pendingCommand) || !a.enabled}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-o2-green/10 text-o2-green border border-o2-green/20 hover:bg-o2-green/20 transition-all disabled:opacity-40"
                  >
                    <Play size={12} />
                    Rodar agora
                  </button>
                  {a.enabled ? (
                    <button
                      onClick={() => sendCommand(a, "pause")}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-surface-3 text-ink-mid hover:text-ink transition-all disabled:opacity-40"
                    >
                      <Pause size={12} />
                      Pausar
                    </button>
                  ) : (
                    <button
                      onClick={() => sendCommand(a, "resume")}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-surface-3 text-ink-mid hover:text-ink transition-all disabled:opacity-40"
                    >
                      <PlayCircle size={12} />
                      Reativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && !loading && (
          <div className="text-center py-16 text-ink-faint">
            <p className="text-3xl mb-3">⚡</p>
            <p className="text-sm">Nenhuma automação cadastrada ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
