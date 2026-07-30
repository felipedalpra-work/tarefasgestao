"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Play, Pause, PlayCircle, CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/Toaster";

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

export default function AutomacoesPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
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

      <div className="space-y-3">
        {items.map((a) => {
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
