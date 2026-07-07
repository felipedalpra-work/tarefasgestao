"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CheckSquare, FileText, Building2, X, Clock, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn, priorityColor, priorityLabel } from "@/lib/utils";

type TaskResult = { id: string; title: string; status: string; priority: string; client: string | null; assignee: { name: string | null } | null };
type RecapResult = { id: string; subject: string; client: string | null; processedAt: string | null };
type Props = { open: boolean; onClose: () => void };

const STATUS_ICON: Record<string, React.ElementType> = { done: CheckCircle2, in_progress: Clock, blocked: AlertCircle, todo: Circle };
const STATUS_COLOR: Record<string, string> = { done: "text-o2-green", in_progress: "text-blue-400", blocked: "text-red-400", todo: "text-ink-ghost" };

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ tasks: TaskResult[]; recaps: RecapResult[]; clients: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) { setQuery(""); setResults(null); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.length < 2) { setResults(null); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      setSelected(0);
      setLoading(false);
    }, 250);
  }, [query]);

  // Flatten for keyboard nav
  const flat: { type: string; label: string; sub?: string; href: string }[] = [];
  if (results) {
    results.tasks.forEach((t) => flat.push({ type: "task", label: t.title, sub: t.client ?? undefined, href: `/tasks?task=${t.id}` }));
    results.recaps.forEach((r) => flat.push({ type: "recap", label: r.subject, sub: r.client ?? undefined, href: `/recaps?recap=${r.id}` }));
    results.clients.forEach((c) => flat.push({ type: "client", label: c, href: `/clientes/${encodeURIComponent(c)}` }));
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, flat.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flat[selected]) { router.push(flat[selected].href); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flat, selected, onClose, router]);

  if (!open) return null;

  const hasResults = results && (results.tasks.length > 0 || results.recaps.length > 0 || results.clients.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-surface border border-surface-3 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-3">
          <Search size={16} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarefas, recaps, clientes…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-ghost focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-ink-faint hover:text-ink-mid">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] text-ink-ghost border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="py-8 text-center text-xs text-ink-faint">Buscando…</div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <div className="py-10 text-center text-sm text-ink-faint">Nenhum resultado para "{query}"</div>
          )}

          {!loading && hasResults && results && (
            <div className="py-2">
              {/* Tasks */}
              {results.tasks.length > 0 && (
                <Section label="Tarefas">
                  {results.tasks.map((t, i) => {
                    const Icon = STATUS_ICON[t.status] ?? Circle;
                    const idx = i;
                    return (
                      <ResultRow
                        key={t.id}
                        selected={selected === idx}
                        onClick={() => { router.push(`/tasks?task=${t.id}`); onClose(); }}
                        icon={<Icon size={14} className={STATUS_COLOR[t.status]} />}
                        label={t.title}
                        sub={t.client}
                        badge={<span className={cn("text-[10px]", priorityColor(t.priority))}>{priorityLabel(t.priority)}</span>}
                      />
                    );
                  })}
                </Section>
              )}

              {/* Recaps */}
              {results.recaps.length > 0 && (
                <Section label="Meet Recaps">
                  {results.recaps.map((r, i) => {
                    const idx = results.tasks.length + i;
                    return (
                      <ResultRow
                        key={r.id}
                        selected={selected === idx}
                        onClick={() => { router.push(`/recaps?recap=${r.id}`); onClose(); }}
                        icon={<FileText size={14} className="text-ink-faint" />}
                        label={r.subject}
                        sub={r.client}
                      />
                    );
                  })}
                </Section>
              )}

              {/* Clients */}
              {results.clients.length > 0 && (
                <Section label="Clientes">
                  {results.clients.map((c, i) => {
                    const idx = results.tasks.length + results.recaps.length + i;
                    return (
                      <ResultRow
                        key={c}
                        selected={selected === idx}
                        onClick={() => { router.push(`/clientes/${encodeURIComponent(c)}`); onClose(); }}
                        icon={<Building2 size={14} className="text-o2-green" />}
                        label={c}
                      />
                    );
                  })}
                </Section>
              )}
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-xs text-ink-ghost">
              Digite para buscar em tarefas, recaps e clientes
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-surface-2 flex items-center gap-4 text-[10px] text-ink-ghost">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navegar</span>
          <span><kbd className="border border-border rounded px-1">Enter</kbd> abrir</span>
          <span><kbd className="border border-border rounded px-1">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 py-1.5 text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

function ResultRow({ icon, label, sub, badge, selected, onClick }: {
  icon: React.ReactNode; label: string; sub?: string | null; badge?: React.ReactNode; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
        selected ? "bg-o2-green/10" : "hover:bg-surface-2"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-sm text-ink truncate block">{label}</span>
        {sub && <span className="text-xs text-ink-faint truncate block">{sub}</span>}
      </span>
      {badge}
    </button>
  );
}
