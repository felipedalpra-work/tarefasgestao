"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, Filter, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Log = {
  id: string;
  level: string;
  category: string;
  message: string;
  detail: string | null;
  createdAt: string;
};

const CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  "gmail-sync":    { label: "Gmail",     emoji: "📧", color: "text-red-400"    },
  "calendar-sync": { label: "Calendar",  emoji: "📅", color: "text-blue-400"   },
  "ia-recap":      { label: "IA Recap",  emoji: "🤖", color: "text-purple-400" },
  "slack":         { label: "Slack",     emoji: "💬", color: "text-purple-300" },
  "briefing":      { label: "Briefing",  emoji: "📨", color: "text-orange-400" },
  "digest":        { label: "Digest",    emoji: "☀️", color: "text-yellow-400" },
};

const LEVELS = [
  { value: "all",   label: "Todos"   },
  { value: "info",  label: "Info"    },
  { value: "warn",  label: "Aviso"   },
  { value: "error", label: "Erro"    },
];

const levelStyle: Record<string, string> = {
  info:  "bg-o2-green/10 text-o2-green border-o2-green/20",
  warn:  "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  error: "bg-red-400/10 text-red-400 border-red-400/20",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildParams = useCallback((before?: string) => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (level !== "all") params.set("level", level);
    if (before) params.set("before", before);
    return params;
  }, [category, level]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?${buildParams()}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("[logs]", err);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  async function loadMore() {
    const last = logs[logs.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/logs?${buildParams(last.createdAt)}`);
      const data = await res.json();
      setLogs((prev) => [...prev, ...(Array.isArray(data.logs) ? data.logs : [])]);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("[logs]", err);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  const allCategories = Object.entries(CATEGORIES);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Logs da Plataforma</h1>
          <p className="text-ink-mid text-sm mt-0.5">
            {logs.length} registro{logs.length !== 1 ? "s" : ""} · atualiza automaticamente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              autoRefresh
                ? "bg-o2-green/10 text-o2-green border-o2-green/20"
                : "bg-surface text-ink-mid border-surface-3"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-o2-green animate-pulse" : "bg-ink-faint"}`} />
            {autoRefresh ? "Live" : "Pausado"}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-surface border border-surface-3 text-ink-mid hover:text-ink transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Category */}
        <div className="flex items-center gap-1 bg-surface border border-surface-3 rounded-xl p-1">
          <button
            onClick={() => setCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              category === "all" ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
            }`}
          >
            Todos
          </button>
          {allCategories.map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setCategory(category === key ? "all" : key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                category === key ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
              }`}
            >
              {cfg.emoji} {cfg.label}
            </button>
          ))}
        </div>

        {/* Level */}
        <div className="flex items-center gap-1 bg-surface border border-surface-3 rounded-xl p-1">
          <Filter size={12} className="text-ink-faint ml-2" />
          {LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                level === l.value ? "bg-o2-green/10 text-o2-green" : "text-ink-mid hover:text-ink"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log list */}
      <div className="space-y-1.5">
        {logs.map((entry) => {
          const cat = CATEGORIES[entry.category];
          return (
            <div
              key={entry.id}
              className={`flex items-start gap-3 rounded-xl p-3.5 border transition-all ${
                entry.level === "error"
                  ? "bg-red-400/5 border-red-400/10"
                  : entry.level === "warn"
                  ? "bg-yellow-400/5 border-yellow-400/10"
                  : "bg-surface border-surface-3"
              }`}
            >
              <span className="text-base mt-0.5 flex-shrink-0">{cat?.emoji ?? "⚙️"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${cat?.color ?? "text-ink-mid"}`}>
                    {cat?.label ?? entry.category}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${levelStyle[entry.level] ?? levelStyle.info}`}>
                    {entry.level}
                  </span>
                  <span className="text-xs text-ink-faint ml-auto flex-shrink-0">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm text-ink mt-1">{entry.message}</p>
                {entry.detail && (
                  <p className="text-xs text-ink-dim mt-0.5 font-mono">{entry.detail}</p>
                )}
              </div>
            </div>
          );
        })}
        {logs.length === 0 && !loading && (
          <div className="text-center py-16 text-ink-faint">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-sm">Nenhum log ainda. Os logs aparecem automaticamente quando as operações ocorrem.</p>
          </div>
        )}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs text-ink-mid hover:text-ink bg-surface border border-surface-3 rounded-xl transition-all disabled:opacity-50"
          >
            <ChevronDown size={14} />
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </div>
    </div>
  );
}
